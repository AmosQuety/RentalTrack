// app/add-tenant.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useDatabase } from "../hooks/use-db";

const InputField = ({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  required = false,
  icon = null,
  multiline = false,
}) => (
  <View style={styles.inputContainer}>
    <Text style={styles.inputLabel}>
      {label} {required && <Text style={styles.required}>*</Text>}
    </Text>
    <View style={[styles.inputWrapper, multiline && styles.multilineInput]}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <TextInput
        style={[styles.textInput, multiline && styles.multilineText]}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  </View>
);

export default function AddTenant() {
  const router = useRouter();
  const { isInitialized, addTenant } = useDatabase();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    roomNumber: "",
    startDate: new Date().toISOString().split("T")[0],
    monthlyRent: "",
    notes: "",
  });

  const [isLoading, setIsLoading] = useState(false);

  const handleAddTenant = async () => {
    if (!formData.name.trim() || !formData.roomNumber.trim() || !formData.monthlyRent) {
      Alert.alert(
        "Missing Information", 
        "Please fill in all required fields marked with *.",
      [{ text: "OK", style: "default" }]
          );
      return;
    }

    // Validate monthly rent
  const monthlyRent = parseFloat(formData.monthlyRent);
  if (isNaN(monthlyRent) || monthlyRent <= 0) {
    Alert.alert(
      "Invalid Amount",
      "Please enter a valid monthly rent amount.",
      [{ text: "OK", style: "default" }]
    );
    return;
  }


    setIsLoading(true);
    try {
      await addTenant({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        roomNumber: formData.roomNumber.trim(),
        startDate: formData.startDate,
        monthlyRent: parseFloat(formData.monthlyRent),
        notes: formData.notes.trim()
      });
      Alert.alert(" ✅ Success", "Tenant added successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Error adding tenant:", error);
        let errorMessage = "Failed to add tenant. Please try again.";
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

  if (!isInitialized) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Initializing database...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Tenant</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Tenant Details</Text>

          <InputField
            label="Full Name"
            value={formData.name}
            onChange={(text) => setFormData((prev) => ({ ...prev, name: text }))}
            placeholder="Enter tenant's full name"
            required
            icon={<Ionicons name="person-outline" size={20} color="#6B7280" />}
          />

          <InputField
            label="Phone Number"
            value={formData.phone}
            onChange={(text) => setFormData((prev) => ({ ...prev, phone: text }))}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
            icon={<Ionicons name="call-outline" size={20} color="#6B7280" />}
          />

          <InputField
            label="Room Number"
            value={formData.roomNumber}
            onChange={(text) => setFormData((prev) => ({ ...prev, roomNumber: text }))}
            placeholder="Enter room number"
            required
            icon={<Ionicons name="business-outline" size={20} color="#6B7280" />}
          />

          <InputField
            label="Monthly Rent (UGX)"
            value={formData.monthlyRent}
            onChange={(text) => setFormData((prev) => ({ ...prev, monthlyRent: text }))}
            placeholder="Enter monthly rent"
            keyboardType="numeric"
            required
            icon={<Ionicons name="cash-outline" size={20} color="#6B7280" />}
          />

          <InputField
            label="Move-in Date"
            value={formData.startDate}
            onChange={(text) => setFormData((prev) => ({ ...prev, startDate: text }))}
            placeholder="YYYY-MM-DD"
            icon={<Ionicons name="calendar-outline" size={20} color="#6B7280" />}
          />

          <InputField
            label="Notes"
            value={formData.notes}
            onChange={(text) => setFormData((prev) => ({ ...prev, notes: text }))}
            placeholder="Additional notes..."
            multiline
            icon={<Ionicons name="document-text-outline" size={20} color="#6B7280" />}
          />
        </View>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            onPress={handleAddTenant}
            disabled={isLoading}
            style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          >
            <View style={styles.buttonContent}>
              {isLoading && <ActivityIndicator color="#fff" style={styles.buttonSpinner} />}
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Adding..." : "Add Tenant"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            disabled={isLoading}
            style={[styles.secondaryButton, isLoading && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#6B7280",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  backButton: {
    width: 40,
    height: 40,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1F2937",
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
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    height: 56,
  },
  multilineInput: {
    height: 100,
    alignItems: "flex-start",
    paddingTop: 12,
  },
  iconContainer: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  multilineText: {
    height: 80,
    textAlignVertical: "top",
  },
  buttonsContainer: {
    paddingBottom: 32,
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSpinner: {
    marginRight: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});



// app/add-tenant.tsx and app/edit-tenant.tsx
// Logic:
// Uses a reusable InputField component, which is good for modularity.
// Input validation for required fields and numeric rent.
// Handles loading states for form submission.
// EditTenant correctly loads existing data.
// Error messages for duplicate room numbers are specific, which is excellent.
// Improvements for Production:
// Form Validation Library: For complex forms, consider a library like Formik with Yup for schema validation. This centralizes validation logic and simplifies error display.
// Date Picker: For startDate, a native date picker (@react-native-community/datetimepicker or expo-datetimepicker) would be significantly better than a plain text input. This prevents invalid date formats.
// Phone Number Formatting: Auto-format phone numbers as users type for a better UX.
// Error Display: Instead of just Alert.alert, display validation errors directly below the input fields.
// trim() on Input: You're doing .trim() on submission, which is good. Consider doing it on onChangeText as well if leading/trailing spaces affect display or intermediate logic.
// keyboardType="numeric" vs decimal-pad: For rent, decimal-pad might be more appropriate if decimal amounts are allowed.
// Input Field Icons: The icon implementation is good.