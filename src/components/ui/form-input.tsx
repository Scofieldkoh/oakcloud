'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Box, Input } from '@chakra-ui/react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

export interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  inputSize?: 'xs' | 'sm' | 'md' | 'lg';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const sizeConfig = {
  xs: { h: '7', fontSize: 'xs', px: '3', iconSize: 14, iconPadding: '8' },
  sm: { h: '8', fontSize: 'sm', px: '3', iconSize: 16, iconPadding: '9' },
  md: { h: '9', fontSize: 'sm', px: '3.5', iconSize: 16, iconPadding: '10' },
  lg: { h: '10', fontSize: 'md', px: '4', iconSize: 20, iconPadding: '11' },
};

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, hint, inputSize = 'sm', leftIcon, rightIcon, id, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const config = sizeConfig[inputSize];

    return (
      <Box display="flex" flexDirection="column" gap="1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-secondary block"
          >
            {label}
          </label>
        )}
        <Box position="relative">
          {leftIcon && (
            <Box
              position="absolute"
              left="3"
              top="50%"
              transform="translateY(-50%)"
              pointerEvents="none"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex="1"
              className="text-text-muted"
              style={{ width: config.iconSize, height: config.iconSize }}
            >
              {leftIcon}
            </Box>
          )}
          <Input
            ref={ref}
            id={inputId}
            type={inputType}
            h={config.h}
            fontSize={config.fontSize}
            px={config.px}
            pl={leftIcon ? config.iconPadding : config.px}
            pr={(rightIcon || isPassword) ? config.iconPadding : config.px}
            borderWidth="1px"
            borderRadius="lg"
            className={`
              bg-background-primary dark:bg-background-secondary
              border-border-primary
              text-text-primary
              placeholder:text-text-muted
              hover:border-border-secondary
              focus:border-oak-primary focus:ring-1 focus:ring-oak-primary focus:outline-none
              ${error ? 'border-red-500 hover:border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
            `}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-none cursor-pointer text-text-muted hover:text-text-secondary transition-colors"
              style={{
                width: config.iconSize,
                height: config.iconSize,
              }}
            >
              {showPassword ? <EyeOff size={config.iconSize} /> : <Eye size={config.iconSize} />}
            </button>
          )}
          {rightIcon && !isPassword && (
            <Box
              position="absolute"
              right="3"
              top="50%"
              transform="translateY(-50%)"
              pointerEvents="none"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex="1"
              className="text-text-muted"
              style={{ width: config.iconSize, height: config.iconSize }}
            >
              {rightIcon}
            </Box>
          )}
        </Box>
        {error && (
          <Box
            id={`${inputId}-error`}
            display="flex"
            alignItems="center"
            gap="1.5"
            fontSize="xs"
            color="red.400"
          >
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            {error}
          </Box>
        )}
        {hint && !error && (
          <Box id={`${inputId}-hint`} fontSize="xs" className="text-text-muted">
            {hint}
          </Box>
        )}
      </Box>
    );
  }
);

FormInput.displayName = 'FormInput';
