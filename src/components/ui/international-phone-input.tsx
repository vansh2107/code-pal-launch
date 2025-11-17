import React from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { cn } from '@/lib/utils';

interface InternationalPhoneInputProps {
  value: string;
  onChange: (value: string | undefined) => void;
  country?: string;
  disabled?: boolean;
  className?: string;
}

export function InternationalPhoneInput({
  value,
  onChange,
  country = 'IN',
  disabled = false,
  className,
}: InternationalPhoneInputProps) {
  return (
    <div className={cn("international-phone-input", className)}>
      <PhoneInput
        international
        countryCallingCodeEditable={false}
        withCountryCallingCode
        country={country as any}
        defaultCountry={country as any}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="phone-input-container"
        placeholder="Enter phone number"
        countrySelectComponent={() => null}
      />
    </div>
  );
}
