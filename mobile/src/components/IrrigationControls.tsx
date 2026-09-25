import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateUUID } from '../utils/uuid';
import { IrrigationCommand } from '../types';

interface Props {
  valveId: string;
  pendingCommand: IrrigationCommand | null;
  canExecuteCommands: boolean;
  role?: string | null;
  status?: string | null;
  onCommandUpdated?: () => void;
}

export default function IrrigationControls({
  valveId,
  pendingCommand,
  canExecuteCommands,
  role,
  status,
  onCommandUpdated,
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState('');

  if (!canExecuteCommands) {
    let reason = "Solo los productores u operadores pueden ejecutar comandos de riego.";
    if (role === 'producer' || role === 'operator') {
      if (status === 'stale') {
        reason = "Acción deshabilitada por seguridad: El lote se encuentra sin señal o inactivo (stale).";
      }
    }
    
    return (
      <View style={{ marginTop: 8, padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' }}>
        <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
          {reason}
        </Text>
      </View>
    );
  }

  const handleCommand = async (action: 'open' | 'close' | 'open_n_min', presetMinutes?: number) => {
    if (!user) return;

    let duration_min: number | null = null;
    if (action === 'open_n_min') {
      const minutesToUse = presetMinutes !== undefined ? presetMinutes : parseInt(duration, 10);
      if (isNaN(minutesToUse) || minutesToUse <= 0 || minutesToUse > 120) {
        Alert.alert('Error', 'Debe ingresar una duración válida (1 a 120 minutos).');
        return;
      }
      duration_min = minutesToUse;
    }

    try {
      setLoading(true);
      const { error } = await supabase.from('irrigation_commands').insert({
        valve_id: valveId,
        requested_by: user.id,
        action,
        duration_min,
        client_request_id: generateUUID(),
      });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Error', 'Ya existe un comando pendiente para esta válvula.');
        } else if (error.code === '42501') {
          Alert.alert('Error', 'No se pudo enviar la orden de riego. Permisos insuficientes.');
        } else {
          Alert.alert('Error', 'No se pudo enviar la orden de riego.');
          console.error(error);
        }
      } else {
        setDuration('');
        onCommandUpdated?.();
      }
    } catch (err) {
      Alert.alert('Error', 'Error inesperado al comunicarse con el servidor.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!pendingCommand) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('irrigation_commands')
        .update({ status: 'cancelled' })
        .eq('id', pendingCommand.id)
        .select();

      if (error) {
        Alert.alert('Error', 'No se pudo cancelar la orden.');
        console.error(error);
      } else if (!data || data.length === 0) {
        Alert.alert('Error', 'La orden ya fue procesada o no tenés permisos para cancelarla.');
      } else {
        onCommandUpdated?.();
      }
    } catch (err) {
      Alert.alert('Error', 'Error inesperado al cancelar.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Retiramos la tarjeta "pending" de aquí; ahora se mostrará en el historial en [id].tsx

  return (
    <View style={styles.container}>
      <Text style={styles.sectionSubtitle}>Acción directa de válvula</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.btnOpen, (loading || !!pendingCommand) && styles.btnDisabled]}
          onPress={() => handleCommand('open')}
          disabled={loading || !!pendingCommand}
          activeOpacity={0.8}
        >
          <MaterialIcons name="water-drop" size={18} color="#ffffff" />
          <Text style={styles.actionBtnText}>Abrir riego</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.btnClose, (loading || !!pendingCommand) && styles.btnDisabled]}
          onPress={() => handleCommand('close')}
          disabled={loading || !!pendingCommand}
          activeOpacity={0.8}
        >
          <MaterialIcons name="stop-circle" size={18} color="#ffffff" />
          <Text style={styles.actionBtnText}>Cerrar válvula</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionSubtitle, { marginTop: 14 }]}>Riego temporizado</Text>
      
      {/* Presets rápidos */}
      <View style={styles.presetRow}>
        <TouchableOpacity
          style={[styles.presetBtn, (loading || !!pendingCommand) && styles.btnDisabledOutline]}
          onPress={() => handleCommand('open_n_min', 15)}
          disabled={loading || !!pendingCommand}
        >
          <Text style={[styles.presetBtnText, (loading || !!pendingCommand) && styles.textDisabled]}>15 min</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetBtn, (loading || !!pendingCommand) && styles.btnDisabledOutline]}
          onPress={() => handleCommand('open_n_min', 30)}
          disabled={loading || !!pendingCommand}
        >
          <Text style={[styles.presetBtnText, (loading || !!pendingCommand) && styles.textDisabled]}>30 min</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetBtn, (loading || !!pendingCommand) && styles.btnDisabledOutline]}
          onPress={() => handleCommand('open_n_min', 60)}
          disabled={loading || !!pendingCommand}
        >
          <Text style={[styles.presetBtnText, (loading || !!pendingCommand) && styles.textDisabled]}>60 min</Text>
        </TouchableOpacity>
      </View>

      {/* Input para duración personalizada */}
      <View style={styles.customInputRow}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Minutos (1-120)"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={duration}
            onChangeText={setDuration}
            editable={!loading && !pendingCommand}
          />
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, styles.btnProgram, (loading || !!pendingCommand) && styles.btnDisabled]}
          onPress={() => handleCommand('open_n_min')}
          disabled={loading || !!pendingCommand}
          activeOpacity={0.8}

        >
          <MaterialIcons name="play-arrow" size={18} color="#ffffff" />
          <Text style={styles.actionBtnText}>Regar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 8,
  },
  btnOpen: {
    backgroundColor: '#059669',
  },
  btnClose: {
    backgroundColor: '#dc2626',
  },
  btnProgram: {
    backgroundColor: '#2563eb',
    flex: 1.2,
  },
  btnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.7,
  },
  btnDisabledOutline: {
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    opacity: 0.7,
  },
  textDisabled: {
    color: '#94a3b8',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetBtn: {
    flex: 1,
    height: 38,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputContainer: {
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  textInput: {
    fontSize: 14,
    color: '#0f172a',
    padding: 0,
  },
  pendingCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 14,
    marginTop: 10,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  pendingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400e',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pendingLabel: {
    fontSize: 13,
    color: '#78350f',
  },
  pendingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    height: 38,
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  sequenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 10,
  },
  sequenceStepDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sequenceTextDone: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  sequenceStepActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fde68a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sequenceTextActive: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
  },
  sequenceStepNext: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sequenceTextNext: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
});
