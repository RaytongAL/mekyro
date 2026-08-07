import type { ReactNode } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

import styles from "./backend-ui.module.css";

export type BackendComboboxOption = {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
};

export type BackendComboboxVariant = "filter" | "form" | "compact";

type BackendComboboxProps = {
  "aria-label": string;
  value: string;
  options: BackendComboboxOption[];
  onChange: (value: string) => void;
  emptyLabel: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  variant?: BackendComboboxVariant;
  className?: string;
  renderOption?: (option: BackendComboboxOption) => ReactNode;
};

export function BackendCombobox({
  "aria-label": ariaLabel,
  value,
  options,
  onChange,
  emptyLabel,
  placeholder,
  id,
  disabled = false,
  variant = "filter",
  className,
  renderOption = (option) => option.label,
}: BackendComboboxProps) {
  const { contains } = ComboboxPrimitive.useFilter();
  const normalizedOptions = options.map((option) => ({
    ...option,
    internalValue: option.value === "" ? "empty:" : `value:${option.value}`,
  }));
  const selectedOption =
    normalizedOptions.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={normalizedOptions}
      value={selectedOption}
      onValueChange={(nextOption) => {
        if (!nextOption) return;
        onChange(nextOption.value);
      }}
      filter={(option, query) =>
        contains(option.searchText ?? option.label, query)
      }
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.internalValue}
      isItemEqualToValue={(option, selected) =>
        option.internalValue === selected.internalValue
      }
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className={cn(
          styles.backendCombobox,
          styles[`backendCombobox_${variant}`],
          className,
        )}
      />
      <ComboboxContent className={styles.backendComboboxContent}>
        <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
        <ComboboxList>
          {(option) => (
            <ComboboxItem
              key={option.internalValue}
              value={option}
              disabled={option.disabled}
              className={styles.backendComboboxItem}
            >
              {renderOption(option)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
