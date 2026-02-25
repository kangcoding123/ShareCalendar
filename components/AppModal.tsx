import React from 'react';
import { Modal, ModalProps, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { useColorScheme } from '@/hooks/useColorScheme';

interface AppModalProps extends ModalProps {
  children: React.ReactNode;
}

export default function AppModal({ children, onShow, ...props }: AppModalProps) {
  const colorScheme = useColorScheme();

  const handleShow = () => {
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync(
        colorScheme === 'dark' ? '#121212' : '#ffffff'
      );
      NavigationBar.setButtonStyleAsync(
        colorScheme === 'dark' ? 'light' : 'dark'
      );
    }
    onShow?.();
  };

  return (
    <Modal
      {...props}
      statusBarTranslucent={Platform.OS === 'android' ? true : props.statusBarTranslucent}
      onShow={handleShow}
    >
      {children}
    </Modal>
  );
}
