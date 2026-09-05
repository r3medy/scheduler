import { fireEvent, screen } from "@testing-library/react"
import type userEvent from "@testing-library/user-event"

export async function chooseSchedule(
  user: ReturnType<typeof userEvent.setup>,
  label = "Date and time",
  day = 5
) {
  await user.click(screen.getByLabelText(label, { exact: true }))
  await user.selectOptions(
    screen.getByRole("combobox", { name: /year/i }),
    "2099"
  )
  await user.selectOptions(
    screen.getByRole("combobox", { name: /month/i }),
    "8"
  )
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`September ${day}\\D.*2099`),
    })
  )
  fireEvent.change(screen.getByLabelText(`${label} time`), {
    target: { value: "12:00" },
  })
}
