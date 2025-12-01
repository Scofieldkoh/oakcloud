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
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.7)',
              display: 'block',
            }}
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
              color="whiteAlpha.500"
              pointerEvents="none"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex="1"
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
            bg="background.secondary"
            borderWidth="1px"
            borderColor={error ? 'red.500' : 'whiteAlpha.100'}
            borderRadius="lg"
            color="white"
            _placeholder={{ color: 'whiteAlpha.400' }}
            _hover={{ borderColor: error ? 'red.500' : 'whiteAlpha.200' }}
            _focus={{
              borderColor: error ? 'red.500' : 'oak.400',
              boxShadow: 'none',
              outline: 'none'
            }}
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
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255, 255, 255, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
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
              color="whiteAlpha.500"
              pointerEvents="none"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex="1"
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
          <Box id={`${inputId}-hint`} fontSize="xs" color="whiteAlpha.500">
            {hint}
          </Box>
        )}
      </Box>
    );
  }
);

FormInput.displayName = 'FormInput';
