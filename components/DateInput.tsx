// components/DateInput.tsx - UPDATED WITH EXPO DATETIMEPICKER
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';



import React, { useEffect, useRef, useState } from 'react';
import {
    Keyboard,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { DateParser, ParseResult } from '../utils/dateParser';

interface DateInputProps {
  label: string;
  value: string; // ISO format (YYYY-MM-DD)
  onChange: (isoDate: string) => void;
  required?: boolean;
  placeholder?: string;
  maxDate?: Date;
  minDate?: Date;
  error?: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  label,
  value,
  onChange,
  required = false,
  placeholder = 'DD/MM/YYYY',
  maxDate,
  minDate,
  error: externalError,
}) => {
  // State
  const [displayValue, setDisplayValue] = useState('');
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [internalError, setInternalError] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Refs
  const inputRef = useRef<TextInput>(null);

  // Derived state
  const showError = isTouched && (internalError || externalError);
  const errorMessage = internalError || externalError;

  // Initialize display value from ISO value
  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear().toString();
        setDisplayValue(`${day}/${month}/${year}`);
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  // Handle text input changes with debouncing
  useEffect(() => {
    if (!isTouched) return;

    const timeoutId = setTimeout(() => {
      handleTextParse(displayValue);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [displayValue, isTouched]);

  // Event Handlers
  const handleTextParse = (text: string) => {
    if (!text.trim()) {
      setInternalError('');
      onChange('');
      return;
    }

    const result: ParseResult = DateParser.parseUserInput(text);
    
    if (result.isValid && result.isoDate) {
      setInternalError('');
      
      if (minDate && result.dateObject && result.dateObject < minDate) {
        setInternalError(`Date cannot be before ${minDate.toLocaleDateString('en-GB')}`);
        return;
      }
      
      if (maxDate && result.dateObject && result.dateObject > maxDate) {
        setInternalError(`Date cannot be after ${maxDate.toLocaleDateString('en-GB')}`);
        return;
      }
      
      onChange(result.isoDate);
    } else {
      setInternalError(result.error || 'Invalid date format');
    }
  };

  const handleTextChange = (text: string) => {
    if (!isTouched) setIsTouched(true);
    setDisplayValue(text);
  };

  const handleFocus = () => {
    setIsTouched(true);
  };

  const handleBlur = () => {
    if (displayValue.trim()) {
      handleTextParse(displayValue);
    }
  };

  const showDatePicker = () => {
    Keyboard.dismiss();
    setTempDate(value ? new Date(value) : new Date());
    setIsPickerVisible(true);
  };

  const hideDatePicker = () => {
    setIsPickerVisible(false);
  };

  const handlePickerConfirm = (selectedDate: Date) => {
    setIsPickerVisible(false);
    const isoDate = selectedDate.toISOString().split('T')[0];
    onChange(isoDate);
    setIsTouched(true);
  };

  const handleQuickSelect = (days: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const isoDate = newDate.toISOString().split('T')[0];
    onChange(isoDate);
    setIsTouched(true);
  };

  const clearDate = () => {
    setDisplayValue('');
    onChange('');
    setInternalError('');
    setIsTouched(true);
  };

  // Render Methods
  const renderInputContainer = () => (
    <View style={[
      styles.inputContainer,
      showError && styles.inputContainerError,
      isTouched && !showError && value && styles.inputContainerSuccess
    ]}>
      <TextInput
        ref={inputRef}
        style={styles.textInput}
        value={displayValue}
        onChangeText={handleTextChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
      />
      {renderActionButtons()}
    </View>
  );

  const renderActionButtons = () => (
    <View style={styles.buttonContainer}>
      {displayValue ? (
        <TouchableOpacity onPress={clearDate} style={styles.clearButton}>
          <Ionicons name="close-circle" size={20} color="#6B7280" />
        </TouchableOpacity>
      ) : null}
      
      <TouchableOpacity onPress={showDatePicker} style={styles.calendarButton}>
        <Ionicons name="calendar-outline" size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );

  const renderQuickSelectButtons = () => (
    <View style={styles.quickSelectContainer}>
      <Text style={styles.quickSelectLabel}>Quick select:</Text>
      <TouchableOpacity onPress={() => handleQuickSelect(-1)} style={styles.quickButton}>
        <Text style={styles.quickButtonText}>Yesterday</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleQuickSelect(0)} style={styles.quickButton}>
        <Text style={styles.quickButtonText}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleQuickSelect(1)} style={styles.quickButton}>
        <Text style={styles.quickButtonText}>Tomorrow</Text>
      </TouchableOpacity>
    </View>
  );

  const renderValidationFeedback = () => {
    if (showError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={16} color="#DC2626" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      );
    }

    if (value) {
      return (
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
          <Text style={styles.successText}>
            {new Date(value).toLocaleDateString('en-GB', { 
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </Text>
        </View>
      );
    }

    return null;
  };

  const renderDatePickerModal = () => {
    if (!isPickerVisible) return null;

    return (
      <Modal
        visible={isPickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={hideDatePicker}
      >
        <TouchableWithoutFeedback onPress={hideDatePicker}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.pickerContainer}>
                {renderPickerHeader()}
                {renderExpoDateTimePicker()}
                {renderPickerActions()}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };

  const renderPickerHeader = () => (
    <View style={styles.pickerHeader}>
      <Text style={styles.pickerTitle}>Select {label}</Text>
      <TouchableOpacity onPress={hideDatePicker}>
        <Ionicons name="close" size={24} color="#374151" />
      </TouchableOpacity>
    </View>
  );

  const renderExpoDateTimePicker = () => (
    <View style={styles.datePickerContainer}>
      <DateTimePicker
        value={tempDate}
        mode="date"
        onChange={(event, date) => {
          if (date) {
            handlePickerConfirm(date);
          }
        }}
        maximumDate={maxDate}
        minimumDate={minDate}
        style={styles.datePicker}
      />
    </View>
  );

  const renderPickerActions = () => (
    <View style={styles.pickerActions}>
      <TouchableOpacity 
        onPress={() => {
          const today = new Date();
          handlePickerConfirm(today);
        }}
        style={styles.todayButton}
      >
        <Text style={styles.todayButtonText}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        onPress={hideDatePicker}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>

      {renderInputContainer()}
      {renderQuickSelectButtons()}
      {renderValidationFeedback()}
      {renderDatePickerModal()}
    </View>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  inputContainerError: {
    borderColor: '#DC2626',
  },
  inputContainerSuccess: {
    borderColor: '#10B981',
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    paddingVertical: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    padding: 4,
    marginRight: 8,
  },
  calendarButton: {
    padding: 4,
  },
  quickSelectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  quickSelectLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 8,
  },
  quickButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  quickButtonText: {
    fontSize: 12,
    color: '#374151',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginLeft: 4,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  successText: {
    fontSize: 12,
    color: '#10B981',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  datePickerContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  datePicker: {
    height: 200,
    width: '100%',
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  todayButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  todayButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#374151',
    fontWeight: '500',
  },
});

export default DateInput;