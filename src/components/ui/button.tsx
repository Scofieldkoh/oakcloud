'use client';

import { forwardRef } from 'react';
import { Button as ChakraButton, Spinner } from '@chakra-ui/react';
import { cn } from '@/lib/utils';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  iconOnly?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const variantMap = {
  primary: { bg: 'oak.500', color: 'white', _hover: { bg: 'oak.600' } },
  secondary: { bg: 'background.elevated', color: 'white', borderWidth: '1px', borderColor: 'whiteAlpha.200', _hover: { bg: 'background.tertiary' } },
  ghost: { bg: 'transparent', color: 'white', _hover: { bg: 'whiteAlpha.100' } },
  danger: { bg: 'red.600', color: 'white', _hover: { bg: 'red.700' } },
};

const sizeMap = {
  xs: { h: '7', px: '3.5', fontSize: 'xs' },
  sm: { h: '8', px: '4', fontSize: 'sm' },
  md: { h: '9', px: '5', fontSize: 'sm' },
  lg: { h: '11', px: '6', fontSize: 'md' },
};

const iconSizeMap = {
  xs: '3.5',
  sm: '4',
  md: '4',
  lg: '5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'sm',
      isLoading,
      iconOnly,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const variantStyles = variantMap[variant];
    const sizeStyles = sizeMap[size];
    const iconSize = iconSizeMap[size];

    return (
      <ChakraButton
        ref={ref}
        disabled={disabled || isLoading}
        {...variantStyles}
        {...sizeStyles}
        borderRadius="lg"
        fontWeight="medium"
        display="flex"
        alignItems="center"
        justifyContent="center"
        gap="2"
        transition="all 0.15s"
        className={cn(className)}
        _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
        {...props}
      >
        {isLoading ? (
          <Spinner boxSize={iconSize} />
        ) : (
          leftIcon && <span style={{ width: `${parseFloat(iconSize) * 4}px`, height: `${parseFloat(iconSize) * 4}px`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{leftIcon}</span>
        )}
        {!iconOnly && children}
        {!isLoading && rightIcon && <span style={{ width: `${parseFloat(iconSize) * 4}px`, height: `${parseFloat(iconSize) * 4}px`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rightIcon}</span>}
      </ChakraButton>
    );
  }
);

Button.displayName = 'Button';
