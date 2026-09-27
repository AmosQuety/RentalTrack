// components/DateInput.tsx
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { DateParser, ParseResult } from '../utils/dateParser';
import { useTheme } from '../theme/ThemeContext';
import { InputField } from './ui/InputField';

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
  const { colors, typography } = useTheme();
  
  // State
  const [displayValue, setDisplayValue] = useState('');
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [internalError, setInternalError] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Derived state
  const showError = isTouched && (internalError || externalError);
  const errorMessage = internalError || externalError;

  const today = new Date();
  const todayDisplay = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

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

  const renderActionButtons = () => (
    <View style={styles.buttonContainer}>
      {displayValue ? (
        <TouchableOpacity onPress={clearDate} style={styles.clearButton}>
          <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
      
      <TouchableOpacity onPress={showDatePicker} style={styles.calendarButton}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderQuickSelectButtons = () => (
    <View style={styles.quickSelectContainer}>
      <Text style={[styles.quickSelectLabel, { color: colors.textSecondary }]}>Quick select:</Text>
      <TouchableOpacity onPress={() => handleQuickSelect(-1)} style={[styles.quickButton, { backgroundColor: colors.inputBackground }]}>
        <Text style={[styles.quickButtonText, { color: colors.text }]}>Yesterday</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleQuickSelect(0)} style={[styles.quickButton, { backgroundColor: colors.inputBackground }]}>
        <Text style={[styles.quickButtonText, { color: colors.text }]}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleQuickSelect(1)} style={[styles.quickButton, { backgroundColor: colors.inputBackground }]}>
        <Text style={[styles.quickButtonText, { color: colors.text }]}>Tomorrow</Text>
      </TouchableOpacity>
    </View>
  );

  const renderValidationFeedback = () => {
    if (showError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={16} color={colors.danger} />
          <Text style={[styles.errorText, { color: colors.danger }]}>{errorMessage}</Text>
        </View>
      );
    }

    if (value) {
      return (
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
          <Text style={[styles.successText, { color: colors.success }]}>
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
          <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.pickerContainer, { backgroundColor: colors.card }]}>
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
    <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
      <Text style={[styles.pickerTitle, { color: colors.text }]}>Select {label}</Text>
      <TouchableOpacity onPress={hideDatePicker}>
        <Ionicons name="close" size={24} color={colors.textSecondary} />
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
        style={[styles.todayButton, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.todayButtonText, { color: colors.primaryContrast }]}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        onPress={hideDatePicker}
        style={[styles.cancelButton, { backgroundColor: colors.inputBackground }]}
      >
        <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <InputField
        label={`${label} ${required ? '*' : ''}`}
        value={displayValue}
        onChangeText={handleTextChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={todayDisplay}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        rightIcon={renderActionButtons()}
        error={showError ? (errorMessage as string) : undefined}
      />
      
      {renderQuickSelectButtons()}
      {renderValidationFeedback()}
      {renderDatePickerModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
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
    marginTop: -8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  quickSelectLabel: {
    fontSize: 12,
    marginRight: 8,
  },
  quickButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  quickButtonText: {
    fontSize: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    marginLeft: 4,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  successText: {
    fontSize: 12,
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerContainer: {
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
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
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
    borderRadius: 8,
  },
  todayButtonText: {
    fontWeight: '500',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontWeight: '500',
  },
});

export default DateInput;