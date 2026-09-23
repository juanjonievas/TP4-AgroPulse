import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PlotStatus } from '../types';
import { getStatusConfig } from '../utils/status';

interface Props {
  status: PlotStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showSublabel?: boolean;
}

export default function StatusBadge({
  status,
  size = 'md',
  showIcon = true,
  showSublabel,
}: Props) {
  const config = getStatusConfig(status);
  const shouldShowSublabel = showSublabel ?? (size === 'lg');

  const iconSizes = {
    sm: 12,
    md: 15,
    lg: 18,
  };

  return (
    <View
      style={[
        styles.badge,
        styles[`badge_${size}`],
        {
          backgroundColor: config.bgColor,
          borderColor: config.borderColor,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {showIcon && (
          <MaterialIcons
            name={config.iconName}
            size={iconSizes[size]}
            color={config.color}
            style={styles.icon}
          />
        )}
        <Text style={[styles.labelText, styles[`text_${size}`], { color: config.color }]}>
          {config.label}
        </Text>
      </View>
      {shouldShowSublabel && (
        <Text style={[styles.sublabelText, styles[`subtext_${size}`], { color: config.color }]}>
          {config.sublabel}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  badge_sm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badge_md: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badge_lg: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  labelText: {
    fontWeight: '700',
  },
  text_sm: {
    fontSize: 11,
  },
  text_md: {
    fontSize: 12,
  },
  text_lg: {
    fontSize: 14,
  },
  sublabelText: {
    fontWeight: '500',
    marginTop: 2,
  },
  subtext_sm: {
    fontSize: 10,
  },
  subtext_md: {
    fontSize: 11,
  },
  subtext_lg: {
    fontSize: 12,
  },
});
