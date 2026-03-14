// app/edit-tenant.tsx - PREMIUM REDESIGN
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateInput from "../components/DateInput";
import { useDatabase } from "../hooks/use-db";
import { useAuth } from "../context/AuthContext";
import { Logger } from "../services/logger/index";
import { useTheme } from "../theme/ThemeContext";
import { InputField } from "../components/ui/InputField";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export default function EditTenant() {
  const { tenantId } = useLocalSearchParams();
  const router = useRouter();
  const { isInitialized, getTenant, updateTenant } = useDatabase();
  const { user } = useAuth();
  const { colors, typography } = useTheme();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    roomNumber: "",
    startDate: "",
    monthlyRent: "",
    rentCycle: "monthly" as 'monthly' | 'biweekly' | 'quarterly',
    contractEndDate: "",
    notes: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const loadTenantData = async () => {
    if (!tenantId || !isInitialized || !user) return;
    
    try {
      const tenant = await getTenant(parseInt(tenantId as string), user.user_id);
      if (tenant) {
        setFormData({
          name: tenant.name,
          phone: tenant.phone || "",
          roomNumber: tenant.room_number,
          startDate: tenant.start_date,
          monthlyRent: tenant.monthly_rent.toString(),
          rentCycle: tenant.rent_cycle || "monthly",
          contractEndDate: tenant.contract_end_date || "",
          notes: tenant.notes || "",
        });
      }
    } catch (error) {
      Logger.error("Error loading tenant data", { actionType: "TENANT_LOAD_ERROR", error });
      Alert.alert("Error", "Failed to load tenant data");
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    loadTenantData();
  }, [tenantId, isInitialized]);

  const handleUpdateTenant = async () => {
    if (!formData.name.trim() || !formData.roomNumber.trim() || !formData.monthlyRent) {
       Alert.alert(
        "Missing Information",
        "Please fill in all required fields.*.",
        [{ text: "OK", style: "default" }]);
      return;
    }

    const monthlyRent = parseFloat(formData.monthlyRent);
    if (isNaN(monthlyRent) || monthlyRent <= 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid monthly rent amount.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }

    if (formData.contractEndDate && formData.startDate > formData.contractEndDate) {
      Alert.alert(
        "Invalid Dates",
        "Contract end date must be after move-in date.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }

    if (!user) return;
    setIsLoading(true);
    try {
      await updateTenant(parseInt(tenantId as string), user.user_id, {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        roomNumber: formData.roomNumber.trim(),
        startDate: formData.startDate,
        monthlyRent: parseFloat(formData.monthlyRent),
        rentCycle: formData.rentCycle,
        contractEndDate: formData.contractEndDate,
        notes: formData.notes.trim()
      });
      
      Alert.alert(
        "Success", "Tenant updated successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Logger.error("Error updating tenant", { actionType: "TENANT_UPDATE_ERROR", error });

       let errorMessage = "Failed to update tenant information. Please try again.";
      let errorTitle = "Error";
    
      if (error.message.includes('Room "')) {
        errorTitle = "🚫 Room Already Occupied";
        errorMessage = error.message;
      } else if (error.message.includes('Unable to verify room availability')) {
        errorTitle = "⚠️ System Busy";
        errorMessage = error.message;
      }
    
      Alert.alert(
        errorTitle,
        errorMessage,
        [{ text: "OK", style: "default" }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isInitialized || isLoadingData) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {isLoadingData ? "Loading tenant data..." : "Initializing database..."}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.inputBackground }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily: typography.fonts.bold }]}>Edit Tenant</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.formContainer}>
          <Text style={[styles.formTitle, { color: colors.text, fontFamily: typography.fonts.semibold }]}>Edit Tenant Details</Text>

          <InputField
            label="Full Name *"
            value={formData.name}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))}
            leftIcon={<Ionicons name="person-outline" size={20} color={colors.textSecondary} />}
          />

          <InputField
            label="Phone Number"
            value={formData.phone}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
            keyboardType="phone-pad"
            leftIcon={<Ionicons name="call-outline" size={20} color={colors.textSecondary} />}
          />

          <InputField
            label="Room Number *"
            value={formData.roomNumber}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, roomNumber: text }))}
            leftIcon={<Ionicons name="business-outline" size={20} color={colors.textSecondary} />}
          />

          <InputField
            label="Monthly Rent (UGX) *"
            value={formData.monthlyRent}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, monthlyRent: text }))}
            keyboardType="numeric"
            leftIcon={<Ionicons name="cash-outline" size={20} color={colors.textSecondary} />}
          />

          <DateInput
            label="Move-in Date"
            value={formData.startDate}
            onChange={(isoDate) => setFormData((prev) => ({ ...prev, startDate: isoDate }))}
            required
            maxDate={new Date()}
          />

          <DateInput
            label="Contract End Date"
            value={formData.contractEndDate}
            onChange={(isoDate) => setFormData((prev) => ({ ...prev, contractEndDate: isoDate }))}
            minDate={new Date(formData.startDate)}
          />

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Rent Cycle <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.cycleOptions}>
              {['monthly', 'biweekly', 'quarterly'].map(cycle => (
                <TouchableOpacity
                  key={cycle}
                  onPress={() => setFormData(prev => ({ ...prev, rentCycle: cycle as any }))}
                  style={[
                    styles.cycleOption,
                    { 
                      backgroundColor: formData.rentCycle === cycle ? colors.primary : colors.inputBackground,
                      borderColor: formData.rentCycle === cycle ? colors.primary : colors.border
                    }
                  ]}
                >
                  <Text style={[
                    styles.cycleOptionText,
                    { 
                      color: formData.rentCycle === cycle ? colors.primaryContrast : colors.text,
                      fontFamily: typography.fonts.medium
                    }
                  ]}>
                    {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <InputField
            label="Notes"
            value={formData.notes}
            onChangeText={(text) => setFormData((prev) => ({ ...prev, notes: text }))}
            multiline
            containerStyle={{ marginTop: 20 }}
            leftIcon={<Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />}
          />
        </Card>

        <View style={styles.buttonsContainer}>
          <Button 
            title={isLoading ? "Updating..." : "Update Tenant"}
            onPress={handleUpdateTenant}
            loading={isLoading}
            size="lg"
            style={{ marginBottom: 16 }}
          />

          <Button 
            title="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            disabled={isLoading}
            size="lg"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  formContainer: {
    padding: 24,
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 18,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  cycleOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  cycleOption: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cycleOptionText: {
    fontSize: 14,
  },
  buttonsContainer: {
    paddingBottom: 40,
  },
});