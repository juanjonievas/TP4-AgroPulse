import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Valve } from '../types';

interface Props {
  valve: Valve;
  pendingCommand?: any;
}

export default function ValveStatus({ valve, pendingCommand }: Props) {
  // Si hay un comando de apertura pendiente, forzamos a que se muestre como CERRADA
  // hasta que el comando pase a APPLIED, tal como solicitó el usuario.
  const isPendingOpen = pendingCommand?.status === 'pending' && (pendingCommand.action === 'open' || pendingCommand.action === 'open_n_min');
  
  const isOpen = valve.status === 'open' && !isPendingOpen;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isOpen ? '#ecfdf5' : '#f8fafc',
          borderColor: isOpen ? '#a7f3d0' : '#e2e8f0',
        },
      ]}
    >
      <View style={styles.contentRow}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isOpen ? '#d1fae5' : '#e2e8f0' },
          ]}
        >
          <MaterialIcons
            name={isOpen ? 'water' : 'block'}
            size={22}
            color={isOpen ? '#059669' : '#64748b'}
          />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.label}>Estado de Válvula de Riego</Text>
          <Text
            style={[
              styles.statusText,
              { color: isOpen ? '#059669' : '#475569' },
            ]}
          >
            {isOpen ? '🟢 ABIERTA' : '🔘 CERRADA'}
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: isOpen ? '#059669' : '#64748b',
            },
          ]}
        >
          <Text style={styles.badgeText}>
            {isOpen ? 'Riego Activo' : 'Inactivo'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginVertical: 8,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  statusText: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
