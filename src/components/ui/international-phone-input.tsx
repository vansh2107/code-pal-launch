import React, { useEffect } from 'react';
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
  // When country prop changes, update the phone input accordingly
  // The library handles the country code automatically
  
  return (
    <div className={cn("international-phone-input", className)}>
      <PhoneInput
        international
        countryCallingCodeEditable={false}
        country={country as any}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="phone-input-container"
        placeholder="Enter phone number"
      />
    </div>
  );
}
