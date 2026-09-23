import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [orgName, setOrgName] = useState<string>('Estancia Didáctica Concordia');

  useEffect(() => {
    async function loadOrg() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('memberships')
          .select('organizations(name)')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data?.organizations) {
          const org = data.organizations as any;
          if (org?.name) {
            setOrgName(org.name);
          }
        }
      } catch (err) {
        console.error('Error cargando organización en perfil:', err);
      }
    }

    loadOrg();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const getRoleDescription = (r: string | null) => {
    switch (r) {
      case 'producer':
        return {
          title: 'Productor Agropecuario',
          desc: 'Puede consultar lotes, modificar umbrales y gestionar operaciones de riego.',
          badgeColor: '#059669',
          badgeBg: '#ecfdf5',
        };
      case 'operator':
        return {
          title: 'Operador de Campo',
          desc: 'Puede consultar lotes y gestionar operaciones de riego.',
          badgeColor: '#2563eb',
          badgeBg: '#eff6ff',
        };
      case 'advisor':
      default:
        return {
          title: 'Asesor Técnico / Consulta',
          desc: 'Cuenta con acceso de consulta. No puede modificar umbrales ni ejecutar riego.',
          badgeColor: '#64748b',
          badgeBg: '#f1f5f9',
        };
    }
  };

  const roleInfo = getRoleDescription(role);

  // Iniciales para el avatar
  const getInitials = () => {
    if (!user?.email) return 'AP';
    return user.email.substring(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Cuenta y Perfil</Text>

        {/* Tarjeta de Usuario con Avatar */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{getInitials()}</Text>
          </View>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleInfo.badgeBg }]}>
            <MaterialIcons name="verified-user" size={14} color={roleInfo.badgeColor} />
            <Text style={[styles.roleBadgeText, { color: roleInfo.badgeColor }]}>
              {roleInfo.title}
            </Text>
          </View>
        </View>

        {/* Tarjeta de Establecimiento y Permisos */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <MaterialIcons name="business" size={20} color="#059669" />
            <View style={styles.detailTextWrapper}>
              <Text style={styles.detailLabel}>Establecimiento Activo</Text>
              <Text style={styles.detailValue}>{orgName}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <MaterialIcons name="security" size={20} color="#2563eb" />
            <View style={styles.detailTextWrapper}>
              <Text style={styles.detailLabel}>Alcance de Permisos</Text>
              <Text style={styles.permDescText}>{roleInfo.desc}</Text>
            </View>
          </View>
        </View>

        {/* Acceso a Diagnóstico Técnico */}
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/diagnostics' as never)}
          activeOpacity={0.8}
        >
          <View style={styles.actionCardLeft}>
            <View style={styles.actionIconBox}>
              <MaterialIcons name="insights" size={22} color="#059669" />
            </View>
            <View>
              <Text style={styles.actionCardTitle}>Diagnóstico Técnico del Sistema</Text>
              <Text style={styles.actionCardSub}>Telemetría en vivo, conectividad y streaming</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#94a3b8" />
        </TouchableOpacity>

        {/* Botón de Cerrar Sesión */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <MaterialIcons name="logout" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
    color: '#0f172a',
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    borderWidth: 2,
    borderColor: '#a7f3d0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#059669',
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailTextWrapper: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  permDescText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 14,
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  actionCardSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  logoutBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 15,
  },
  disclaimerContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  disclaimerText: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
