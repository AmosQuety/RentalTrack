// components/ui/InputField.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  Text,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

interface InputFieldProps extends TextInputProps {
  label: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  inputStyle,
  value,
  onFocus,
  onBlur,
  ...props
}) => {
  const { colors, typography } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  
  // Check if string is empty
  const hasValue = value ? value.length > 0 : false;
  
  const animatedIsFocused = useRef(new Animated.Value(hasValue ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedIsFocused, {
      toValue: isFocused || hasValue ? 1 : 0,
      duration: 150,
      useNativeDriver: false, // We're animating layout properties
    }).start();
  }, [isFocused, hasValue]);

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };

  const labelStyle = {
    position: 'absolute' as 'absolute',
    left: leftIcon ? 44 : 16,
    top: animatedIsFocused.interpolate({
      inputRange: [0, 1],
      outputRange: [18, 6],
    }),
    fontSize: animatedIsFocused.interpolate({
      inputRange: [0, 1],
      outputRange: [typography.sizes.md, typography.sizes.xs],
    }),
    color: animatedIsFocused.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.textSecondary, colors.primary],
    }),
    fontFamily: typography.fonts.medium,
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.inputBackground,
            borderColor: error ? colors.danger : isFocused ? colors.primary : 'transparent',
            borderWidth: isFocused || error ? 1 : 1,
            // When not focused and no error, use background color for border so it doesn't shift
            ...( !isFocused && !error ? { borderColor: colors.inputBackground } : {} )
          },
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        
        <Animated.Text style={labelStyle}>
          {label}
        </Animated.Text>
        
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: typography.fonts.regular,
              fontSize: typography.sizes.md,
              paddingLeft: leftIcon ? 44 : 16,
              paddingRight: rightIcon ? 44 : 16,
            },
            inputStyle,
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          value={value}
          placeholderTextColor="transparent" // Hide actual placeholder
          {...props}
        />
        
        {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
      </View>
      
      {error && (
        <Text style={[styles.errorText, { color: colors.danger, fontFamily: typography.fonts.medium }]}>
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  inputContainer: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingTop: 16, // Make room for floating label
    paddingBottom: 4,
  },
  leftIcon: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  rightIcon: {
    position: 'absolute',
    right: 16,
    zIndex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    marginLeft: 4,
  },
});
