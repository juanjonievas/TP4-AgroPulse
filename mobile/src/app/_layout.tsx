import React, { useEffect } from "react";
import { View, ActivityIndicator, LogBox } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

LogBox.ignoreAllLogs();

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "login";

    if (!session && !inAuthGroup) {
      // Redirigir a login si no hay sesión
      router.replace("/login");
    } else if (session && inAuthGroup) {
      // Redirigir al home si hay sesión y está en login
      router.replace("/");
    }
  }, [session, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="plot/[id]" options={{ title: "Detalle de Lote" }} />
      <Stack.Screen name="diagnostics" options={{ title: "Diagnóstico Técnico" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
