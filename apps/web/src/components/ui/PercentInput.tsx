import { DecimalInput, type DecimalInputProps } from './numberInput';

export type PercentInputProps = Omit<DecimalInputProps, 'scale' | 'suffix'>;

/** Procent: użytkownik wpisuje „7,5”, wartość w modelu to ułamek 0.075. */
export function PercentInput(props: PercentInputProps) {
  return <DecimalInput {...props} scale={100} suffix="%" />;
}
