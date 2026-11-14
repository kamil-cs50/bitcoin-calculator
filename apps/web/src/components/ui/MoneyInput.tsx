import { DecimalInput, type DecimalInputProps } from './numberInput';

export type MoneyInputProps = Omit<DecimalInputProps, 'scale'>;

/** Kwota: przyjmuje „12 500,50”, zwraca liczbę (12500.5) albo null; litery są odrzucane. */
export function MoneyInput(props: MoneyInputProps) {
  return <DecimalInput {...props} />;
}
