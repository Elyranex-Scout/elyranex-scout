import { Icon } from "@/src/components/Icon";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="scanner">
          <NativeTabs.Trigger.Icon sf="barcode.viewfinder" />
          <NativeTabs.Trigger.Label>Escáner</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="inventory">
          <NativeTabs.Trigger.Icon sf="shippingbox.fill" />
          <NativeTabs.Trigger.Label>Inventario</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="balance">
          <NativeTabs.Trigger.Icon sf="eurosign.circle.fill" />
          <NativeTabs.Trigger.Label>Balance</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 72 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 13, fontWeight: "800" },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Escáner",
          tabBarButtonTestID: "tab-scanner",
          tabBarIcon: ({ color }) => <Icon name="barcode-scan" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventario",
          tabBarButtonTestID: "tab-inventory",
          tabBarIcon: ({ color }) => (
            <Icon name="package-variant-closed" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="balance"
        options={{
          title: "Balance",
          tabBarButtonTestID: "tab-balance",
          tabBarIcon: ({ color }) => <Icon name="scale-balance" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
