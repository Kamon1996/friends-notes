import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveAvatar, type AvatarUris } from '@/lib/avatars';
import { loadEnrichment } from '@/lib/contacts';
import { phoneKey } from '@/lib/messengers';
import type { Friend } from '@/lib/types';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';
import { useTheme } from './ui';

type Props = {
  friend: Pick<Friend, 'id' | 'name' | 'phone' | 'photoUri' | 'thumbUri'>;
  size?: number;
  onChange: (uris: AvatarUris | null) => void;
};

const PICK_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.92 };

function deniedAlert(what: string) {
  Alert.alert(`Нет доступа к ${what}`, 'Разреши его в настройках телефона.', [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Открыть настройки', onPress: () => Linking.openSettings() },
  ]);
}

/** Аватар с кнопкой-камерой: выбрать фото из галереи, снять на камеру, взять из контактов или убрать. */
export function AvatarPicker({ friend, size = 72, onChange }: Props) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (asset: ImagePicker.ImagePickerAsset) => {
    setBusy(true);
    try {
      onChange(await saveAvatar(friend.id, asset.uri, asset.width));
    } catch (e) {
      Alert.alert('Не получилось сохранить фото', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async () => {
    setOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return deniedAlert('галерее');
    const res = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    if (!res.canceled && res.assets[0]) await apply(res.assets[0]);
  };

  const fromCamera = async () => {
    setOpen(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return deniedAlert('камере');
    const res = await ImagePicker.launchCameraAsync({ ...PICK_OPTIONS, cameraType: ImagePicker.CameraType.front });
    if (!res.canceled && res.assets[0]) await apply(res.assets[0]);
  };

  const fromContacts = async () => {
    setOpen(false);
    setBusy(true);
    try {
      const found = (await loadEnrichment()).get(phoneKey(friend.phone));
      if (found?.photoUri) onChange({ photoUri: found.photoUri, thumbUri: found.thumbUri ?? found.photoUri });
      else Alert.alert('Фото не нашлось', 'В телефонной книге у контакта с этим номером нет фотографии.');
    } catch (e) {
      Alert.alert('Не получилось прочитать контакты', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setOpen(false);
    onChange(null);
  };

  const options: { key: string; icon: IconName; label: string; onPress: () => void; danger?: boolean }[] = [
    { key: 'library', icon: 'import', label: 'Выбрать из галереи', onPress: fromLibrary },
    ...(Platform.OS === 'web' ? [] : [{ key: 'camera', icon: 'camera' as IconName, label: 'Сделать фото', onPress: fromCamera }]),
    ...(Platform.OS === 'android' && friend.phone.trim()
      ? [{ key: 'contacts', icon: 'people' as IconName, label: 'Взять из контактов телефона', onPress: fromContacts }]
      : []),
    ...(friend.photoUri || friend.thumbUri ? [{ key: 'remove', icon: 'trash' as IconName, label: 'Убрать фото', onPress: remove, danger: true }] : []),
  ];

  return (
    <>
      <Pressable onPress={() => setOpen(true)} disabled={busy} accessibilityLabel="Изменить фото" style={({ pressed }) => ({ opacity: pressed || busy ? 0.6 : 1 })}>
        <Avatar friend={friend} size={size} />
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="camera" size={14} color={colors.onAccent} strokeWidth={2} />
        </View>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} dim={0.35} style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.text, textAlign: 'center', paddingVertical: 10 }}>Фото</Text>
        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={o.onPress}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 12, borderRadius: 14, backgroundColor: pressed ? colors.chip : 'transparent' })}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: o.danger ? colors.dangerSoft : colors.chip, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={o.icon} size={18} color={o.danger ? colors.danger : colors.text2} />
            </View>
            <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: o.danger ? colors.danger : colors.text }}>{o.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setOpen(false)} style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.text2 }}>Отмена</Text>
        </Pressable>
      </Sheet>
    </>
  );
}
