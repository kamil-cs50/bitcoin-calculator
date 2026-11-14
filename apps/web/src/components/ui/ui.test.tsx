import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Field } from './Field';
import { InfoTip } from './InfoTip';
import { MoneyInput } from './MoneyInput';
import { PercentInput } from './PercentInput';
import { Sheet } from './Sheet';
import { Toggle } from './Toggle';

const wrap = (ui: React.ReactNode) => render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>);

describe('komponenty UI mają dostępne nazwy', () => {
  it('Button', async () => {
    const onClick = vi.fn();
    wrap(<Button onClick={onClick}>Policz</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Policz' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('Card ma nazwę z nagłówka', () => {
    wrap(<Card title="Typowy wynik">treść</Card>);
    expect(screen.getByRole('region', { name: 'Typowy wynik' })).toBeInTheDocument();
  });

  it('Field łączy etykietę, podpowiedź i błąd z polem', () => {
    wrap(
      <Field label="Wiek" hint="w latach" error="Za mało">
        {(p) => <input {...p} />}
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Wiek' });
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription('w latach Za mało');
  });

  it('Badge', () => {
    wrap(<Badge tone="warning">niezweryfikowane</Badge>);
    expect(screen.getByText('niezweryfikowane')).toBeInTheDocument();
  });

  it('InfoTip otwiera objaśnienie przyciskiem', async () => {
    wrap(<InfoTip label="Czym jest zmienność">Jak mocno cena skacze.</InfoTip>);
    await userEvent.click(screen.getByRole('button', { name: 'Czym jest zmienność' }));
    expect(screen.getByText('Jak mocno cena skacze.')).toBeInTheDocument();
  });

  it('Sheet to okno dialogowe z tytułem', async () => {
    wrap(
      <Sheet title="Dodaj aktywo" trigger={<Button>Otwórz</Button>}>
        zawartość
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Otwórz' }));
    expect(screen.getByRole('dialog', { name: 'Dodaj aktywo' })).toBeInTheDocument();
  });
});

describe('Toggle', () => {
  it('reaguje na spację i ma nazwę', async () => {
    const onChange = vi.fn();
    function T() {
      const [v, setV] = useState(false);
      return (
        <Toggle
          label="Realnie"
          checked={v}
          onCheckedChange={(x) => {
            onChange(x);
            setV(x);
          }}
        />
      );
    }
    wrap(<T />);
    const sw = screen.getByRole('switch', { name: 'Realnie' });
    expect(sw).not.toBeChecked();
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
    expect(sw).toBeChecked();
  });
});

describe('MoneyInput', () => {
  function Harness({ onValue }: { onValue: (v: number | null) => void }) {
    const [v, setV] = useState<number | null>(null);
    return (
      <MoneyInput
        label="Kwota"
        value={v}
        onChange={(x) => {
          setV(x);
          onValue(x);
        }}
      />
    );
  }

  it('przyjmuje „12 500,50” i zwraca 12500.5', async () => {
    const onValue = vi.fn();
    wrap(<Harness onValue={onValue} />);
    const input = screen.getByRole('textbox', { name: 'Kwota' });
    await userEvent.type(input, '12 500,50');
    expect(onValue).toHaveBeenLastCalledWith(12500.5);
    expect(input).toHaveValue('12 500,50');
  });

  it('odrzuca litery', async () => {
    const onValue = vi.fn();
    wrap(<Harness onValue={onValue} />);
    const input = screen.getByRole('textbox', { name: 'Kwota' });
    await userEvent.type(input, '12abc3');
    expect(input).toHaveValue('123');
    expect(onValue).toHaveBeenLastCalledWith(123);
  });

  it('puste pole daje null', async () => {
    const onValue = vi.fn();
    wrap(<Harness onValue={onValue} />);
    const input = screen.getByRole('textbox', { name: 'Kwota' });
    await userEvent.type(input, '5');
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
  });
});

describe('PercentInput', () => {
  it('zamienia „7,5” na ułamek 0.075', async () => {
    const onChange = vi.fn();
    function H() {
      const [v, setV] = useState<number | null>(null);
      return (
        <PercentInput
          label="Stopa"
          value={v}
          onChange={(x) => {
            setV(x);
            onChange(x);
          }}
        />
      );
    }
    wrap(<H />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Stopa' }), '7,5');
    expect(onChange).toHaveBeenLastCalledWith(0.075);
  });
});
