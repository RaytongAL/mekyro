import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

import styles from "./ops-shell.module.css";

const EMPTY_VALUE = "__all__";

type BackendSelectOption = {
  value: string;
  label: ReactNode;
};

type BackendSelectProps = {
  "aria-label": string;
  value: string;
  options: BackendSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  contentClassName?: string;
};

function BackendSelect({
  "aria-label": ariaLabel,
  value,
  options,
  onChange,
  className,
  contentClassName,
}: BackendSelectProps) {
  const selectedValue = value || EMPTY_VALUE;
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectItems = options.map((option) => ({
    value: option.value || EMPTY_VALUE,
    label: option.label,
  }));

  return (
    <Select
      items={selectItems}
      value={selectedValue}
      onValueChange={(nextValue) => onChange(nextValue === EMPTY_VALUE ? "" : String(nextValue ?? ""))}
    >
      <SelectTrigger
        size="sm"
        className={className ?? styles.backendSelectTrigger}
        aria-label={ariaLabel}
      >
        <span className={styles.backendSelectValue}>{selectedOption?.label}</span>
      </SelectTrigger>
      <SelectContent
        align="end"
        alignItemWithTrigger={false}
        className={contentClassName ?? styles.backendSelectContent}
      >
        <SelectGroup>
          {options.map((option, index) => (
            <SelectItem
              key={`${option.value || EMPTY_VALUE}-${index}`}
              value={option.value || EMPTY_VALUE}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

type BackendPageSizeSelectProps = {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
};

export function BackendPageSizeSelect({
  label,
  value,
  options,
  onChange,
}: BackendPageSizeSelectProps) {
  return (
    <BackendSelect
      aria-label={label}
      value={String(value)}
      onChange={(nextValue) => onChange(Number(nextValue))}
      options={options.map((option) => ({
        value: String(option),
        label: `${option}${label}`,
      }))}
      className={styles.pageSizeSelect}
      contentClassName={styles.pageSizeSelectContent}
    />
  );
}
