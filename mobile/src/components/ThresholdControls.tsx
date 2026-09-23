import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

interface Props {
  plotId: string;
  thresholdMin: number;
  thresholdMax: number;
  canEdit: boolean;
}

export default function ThresholdControls({ plotId, thresholdMin, thresholdMax, canEdit }: Props) {
  const [minVal, setMinVal] = useState(thresholdMin.toString());
  const [maxVal, setMaxVal] = useState(thresholdMax.toString());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMinVal(thresholdMin.toString());
    setMaxVal(thresholdMax.toString());
  }, [thresholdMin, thresholdMax]);

  if (!canEdit) {
    return (
      <View style={styles.readOnlyContainer}>
        <View style={styles.readOnlyHeader}>
          <MaterialIcons name="tune" size={18} color="#64748b" />
          <Text style={styles.readOnlyTitle}>Umbrales Agronómicos Configurados</Text>
        </View>
        <Text style={styles.helperText}>
          Los umbrales determinan cuándo AgroPulse considera que el suelo está seco, óptimo o con exceso de humedad.
        </Text>
        <View style={styles.readOnlyRow}>
          <Text style={styles.readOnlyBadge}>Mínimo: {thresholdMin}%</Text>
          <Text style={styles.readOnlyBadge}>Máximo: {thresholdMax}%</Text>
        </View>
      </View>
    );
  }

  const handleSave = async () => {
    if (!minVal || !maxVal) {
      Alert.alert('Error', 'Los valores no pueden estar vacíos.');
      return;
    }

    const minParsed = parseInt(minVal, 10);
    const maxParsed = parseInt(maxVal, 10);

    if (isNaN(minParsed) || isNaN(maxParsed)) {
      Alert.alert('Error', 'Los valores deben ser números válidos.');
      return;
    }

    if (minParsed < 0 || minParsed > 100 || maxParsed < 0 || maxParsed > 100) {
      Alert.alert('Error', 'Los umbrales deben estar entre 0 y 100.');
      return;
    }

    if (minParsed > maxParsed) {
      Alert.alert('Error', 'El umbral mínimo no puede ser mayor al máximo.');
      return;
    }

    if (minParsed === thresholdMin && maxParsed === thresholdMax) {
      return; // No hay cambios
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('plots')
        .update({ threshold_min: minParsed, threshold_max: maxParsed })
        .eq('id', plotId)
        .select();

      if (error) {
        Alert.alert('Error', 'No se pudo guardar el cambio.');
        console.error(error);
      } else if (!data || data.length === 0) {
        Alert.alert('Error', 'Permisos insuficientes para modificar umbrales.');
      } else {
        Alert.alert('Éxito', 'Umbrales actualizados correctamente.');
      }
    } catch (err) {
      Alert.alert('Error', 'Error inesperado al guardar los umbrales.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <MaterialIcons name="tune" size={20} color="#0f172a" />
        <Text style={styles.title}>Configuración de Umbrales</Text>
      </View>

      <Text style={styles.helperText}>
        Los umbrales determinan cuándo AgroPulse considera que el suelo está seco, óptimo o con exceso de humedad.
      </Text>

      <View style={styles.inputsRow}>
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Mínimo (%)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={minVal}
              onChangeText={setMinVal}
              editable={!loading}
              placeholder="Min"
            />
            <Text style={styles.unitSuffix}>%</Text>
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Máximo (%)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={maxVal}
              onChangeText={setMaxVal}
              editable={!loading}
              placeholder="Max"
            />
            <Text style={styles.unitSuffix}>%</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <MaterialIcons name="save" size={16} color="#ffffff" />
              <Text style={styles.saveBtnText}>Guardar</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 12,
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    padding: 0,
  },
  unitSuffix: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginLeft: 2,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  readOnlyContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  readOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  readOnlyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  readOnlyRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  readOnlyBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
