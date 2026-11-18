import * as React from "react"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled = false,
}: DatePickerInputProps) {
  const [open, setOpen] = React.useState(false)
  
  const dateValue = React.useMemo(() => {
    if (!value) return undefined
    const parsed = parse(value, 'yyyy-MM-dd', new Date())
    return isValid(parsed) ? parsed : undefined
  }, [value])

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'))
    } else {
      onChange('')
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !dateValue && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateValue ? format(dateValue, "MM/dd/yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border shadow-lg bg-popover" align="start">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleSelect}
          autoFocus
        />
        <div className="flex justify-between px-4 pb-3 pt-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            Clear
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(format(new Date(), 'yyyy-MM-dd'))
              setOpen(false)
            }}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
