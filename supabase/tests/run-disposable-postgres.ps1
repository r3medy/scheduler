[CmdletBinding()]
param(
  [string]$Image = "postgres:17-alpine"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$containerName = "scheduler-mvp-test-$PID-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$containerLabel = "scheduler.mvp.verification=true"
$database = "scheduler_test"
$ownerId = "00000000-0000-4000-8000-000000000001"
$otherOwnerId = "00000000-0000-4000-8000-000000000002"
$started = $false

function Invoke-DisposablePsql {
  param(
    [Parameter(Mandatory)]
    [string]$Sql,
    [switch]$Unaligned
  )

  $arguments = @(
    "exec", "-i", $containerName,
    "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", $database
  )
  if ($Unaligned) { $arguments += @("-A", "-t") }

  $output = @($Sql | & docker @arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Disposable PostgreSQL command failed:`n$($output -join "`n")"
  }
  return $output
}

function Invoke-ParallelPsql {
  param(
    [Parameter(Mandatory)]
    [string[]]$SqlStatements,
    [switch]$Unaligned
  )

  $parallelJobs = @()
  $jobScript = {
    param($Name, $Database, $Sql, $UseUnaligned)

    $arguments = @(
      "exec", "-i", $Name,
      "psql", "-X", "-v", "ON_ERROR_STOP=1",
      "-U", "postgres", "-d", $Database
    )
    if ($UseUnaligned) { $arguments += @("-A", "-t") }
    $output = @($Sql | & docker @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw ($output -join "`n")
    }
    $output
  }

  try {
    foreach ($sql in $SqlStatements) {
      $parallelJobs = @($parallelJobs) + @(Start-Job -ScriptBlock $jobScript -ArgumentList @(
        $containerName, $database, $sql, [bool]$Unaligned
      ))
    }
    foreach ($job in $parallelJobs) { Wait-Job -Id $job.Id | Out-Null }

    $outputs = @()
    foreach ($job in $parallelJobs) {
      if ($job.State -ne "Completed") {
        $jobError = Receive-Job -Id $job.Id 2>&1
        throw "Parallel disposable PostgreSQL session failed ($($job.State)):`n$($jobError -join "`n")"
      }
      $outputs += @(Receive-Job -Id $job.Id)
    }
    return $outputs
  } finally {
    foreach ($job in $parallelJobs) {
      Stop-Job -Id $job.Id -ErrorAction SilentlyContinue | Out-Null
      Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue
    }
    $parallelJobs = @()
  }
}

try {
  & docker run --rm -d --name $containerName --label $containerLabel `
    -e "POSTGRES_PASSWORD=disposable-verification-only" `
    -e "POSTGRES_DB=$database" $Image | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not start disposable PostgreSQL container" }
  $started = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
    # pg_isready can briefly report success while the postmaster is still
    # completing startup. Require an actual SQL round trip before bootstrap.
    $probeErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & docker exec $containerName psql -X -v ON_ERROR_STOP=1 `
        -U postgres -d $database -c "select 1" *> $null
      $probeExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $probeErrorAction
    }
    if ($probeExitCode -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Disposable PostgreSQL did not become ready" }

  $bootstrap = @"
create extension if not exists pgcrypto;
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create table auth.users (
  id uuid primary key,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid
language sql stable
as `$fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
`$fn$;
grant usage on schema auth to public;
grant execute on function auth.uid() to public;
insert into auth.users (id) values
  ('$ownerId'), ('$otherOwnerId');
"@
  Invoke-DisposablePsql -Sql $bootstrap | Out-Null

  $migrationPaths = @(
    Get-ChildItem -LiteralPath (Join-Path $repoRoot "supabase\migrations") `
      -Filter "*.sql" -File | Sort-Object Name
  )
  foreach ($migration in $migrationPaths) {
    Write-Host "APPLY $($migration.Name)"
    Invoke-DisposablePsql -Sql (Get-Content -LiteralPath $migration.FullName -Raw) | Out-Null
  }
  Write-Host "APPLIED $($migrationPaths.Count) migrations through $($migrationPaths[-1].Name)"

  foreach ($testName in @(
    "callback_integrity.sql",
    "callback_rls_integrity.sql",
    "auth_rate_limit_integrity.sql"
  )) {
    Write-Host "RUN $testName"
    Invoke-DisposablePsql -Sql (Get-Content -LiteralPath (Join-Path $PSScriptRoot $testName) -Raw) | Out-Null
    Write-Host "PASS $testName"
  }

  $idempotencySql = @"
begin;
set role authenticated;
select set_config('request.jwt.claim.sub', '$ownerId', false);
select callback_id::text || '|' || created::text || '|' || same_payload::text
  from public.create_callback_idempotent(
    '44444444-4444-4444-8444-444444444444',
    '0124444444', 'parallel-idempotency', 'SQL Parallel', null, 'exact',
    '2099-01-01 10:00:00+00', null, null
  );
commit;
"@
  $idempotencyRawResults = @(Invoke-ParallelPsql `
    -SqlStatements @($idempotencySql, $idempotencySql) -Unaligned
  )
  Write-Host "PARALLEL idempotency raw: $($idempotencyRawResults -join ' | ')"
  $idempotencyResults = @($idempotencyRawResults |
    Where-Object { "$_" -match "^[0-9a-f-]{36}\|(true|false)\|(true|false)$" } |
    ForEach-Object { "$_".Trim() }
  )
  if ($idempotencyResults.Count -ne 2) {
    throw "Expected two idempotency session results, got $($idempotencyResults.Count): $($idempotencyResults -join ', ')"
  }
  $idempotencyRecords = @($idempotencyResults | ForEach-Object {
    $fields = "$_".Split("|")
    [pscustomobject]@{ Id = $fields[0]; Created = $fields[1]; SamePayload = $fields[2] }
  })
  if (@($idempotencyRecords.Id | Select-Object -Unique).Count -ne 1 -or
      @($idempotencyRecords | Where-Object Created -eq "true").Count -ne 1 -or
      @($idempotencyRecords | Where-Object SamePayload -ne "true").Count -ne 0) {
    throw "Parallel idempotency sessions did not produce one shared row/result: $($idempotencyResults -join ', ')"
  }
  Write-Host "PASS parallel idempotency sessions ($($idempotencyRecords[0].Id))"

  $idempotencyCount = Invoke-DisposablePsql -Unaligned -Sql @"
select count(*) from public.callbacks
 where user_id = '$ownerId'
   and create_request_key = '44444444-4444-4444-8444-444444444444';
"@
  if (("$idempotencyCount".Trim()) -ne "1") {
    throw "Parallel idempotency produced an unexpected row count: $idempotencyCount"
  }

  $admissionSql = @"
set role service_role;
select case when allowed then 't' else 'f' end || '|' || coalesce(admission_token::text, 'null')
  from public.auth_rate_limit_admit(
    'login-company', repeat('e', 64), 900, 2, 900
  );
"@
  $admissionRawResults = @(Invoke-ParallelPsql `
    -SqlStatements @($admissionSql, $admissionSql, $admissionSql, $admissionSql) -Unaligned
  )
  Write-Host "PARALLEL admission raw: $($admissionRawResults -join ' | ')"
  $admissionResults = @($admissionRawResults |
    Where-Object { "$_" -match "^[tf]\|(?:[0-9]+|null)$" } |
    ForEach-Object { "$_".Trim() }
  )
  if ($admissionResults.Count -ne 4) {
    throw "Expected four admission session results, got $($admissionResults.Count): $($admissionResults -join ', ')"
  }
  $allowedCount = @($admissionResults | Where-Object { $_.StartsWith("t|") }).Count
  $blockedCount = @($admissionResults | Where-Object { $_.StartsWith("f|") }).Count
  if ($allowedCount -ne 2 -or $blockedCount -ne 2) {
    throw "Expected exactly two admitted and two blocked concurrent auth calls, got $allowedCount admitted / $blockedCount blocked ($($admissionResults -join ', '))"
  }
  Write-Host "PASS parallel auth admission (2 admitted, 2 blocked)"

  Write-Host "DISPOSABLE POSTGRES VERIFICATION PASSED"
} finally {
  if ($started) {
    & docker rm -f $containerName *> $null
    if ($LASTEXITCODE -eq 0) { Write-Host "REMOVED $containerName" }
  }
}
