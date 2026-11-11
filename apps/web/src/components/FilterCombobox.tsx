import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@workspace/ui/components/combobox"
import { normalizeText } from "../lib/collections"

interface Option { value: string; label: string }
interface Props {
  id: string
  value: string
  options: Option[]
  placeholder: string
  emptyLabel: string
  onChange: (value: string) => void
}

export function FilterCombobox({ id, value, options, placeholder, emptyLabel, onChange }: Props) {
  return <Combobox
    items={options}
    value={options.find((option) => option.value === value) ?? null}
    onValueChange={(option) => onChange(option?.value ?? "")}
    itemToStringLabel={(option) => option.label}
    itemToStringValue={(option) => option.value}
    isItemEqualToValue={(option, selected) => option.value === selected.value}
    filter={(option, query) => normalizeText(option.label).includes(normalizeText(query))}
  >
    <ComboboxInput id={id} placeholder={placeholder} showClear />
    <ComboboxContent><ComboboxEmpty>{emptyLabel}</ComboboxEmpty><ComboboxList>{(option: Option) => <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>
}
