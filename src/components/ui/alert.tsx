'use client';

import { Box, Text, IconButton } from '@chakra-ui/react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export interface AlertProps {
  variant?: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
  compact?: boolean;
}

const variantConfig = {
  error: {
    icon: AlertCircle,
    bg: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
    color: 'red.400',
  },
  success: {
    icon: CheckCircle2,
    bg: 'rgba(34, 197, 94, 0.1)',
    borderColor: 'rgba(34, 197, 94, 0.2)',
    color: 'green.400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'rgba(234, 179, 8, 0.1)',
    borderColor: 'rgba(234, 179, 8, 0.2)',
    color: 'yellow.400',
  },
  info: {
    icon: Info,
    bg: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.2)',
    color: 'blue.400',
  },
};

export function Alert({ variant = 'info', title, children, onClose, className, compact }: AlertProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Box
      display="flex"
      gap="2.5"
      borderRadius="md"
      borderWidth="1px"
      p={compact ? '2.5' : '3'}
      bg={config.bg}
      borderColor={config.borderColor}
      color={config.color}
      role="alert"
      className={className}
    >
      <Icon size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
      <Box flex="1" minW="0">
        {title && (
          <Text fontSize="sm" fontWeight="medium" mb="0.5">
            {title}
          </Text>
        )}
        <Box fontSize="sm" opacity="0.9">
          {children}
        </Box>
      </Box>
      {onClose && (
        <IconButton
          onClick={onClose}
          size="xs"
          variant="ghost"
          aria-label="Dismiss"
          p="1"
          borderRadius="sm"
          _hover={{ bg: 'whiteAlpha.100' }}
        >
          <X size={14} />
        </IconButton>
      )}
    </Box>
  );
}
