import { useState, type ComponentProps, type ReactNode } from 'react';
import Feather from '@expo/vector-icons/Feather';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { validateMedication, type Medication } from './medication';

export const colors = {
  background: '#F5F7F5', paper: '#FFFFFF', ink: '#183A33', muted: '#576B65',
  green: '#22634D', mint: '#E6F1EA', line: '#DCE5DF', amber: '#805010', amberBg: '#FFF4DF', red: '#A33131',
};

type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({ name, color = colors.green, size = 20 }: { name: IconName; color?: string; size?: number }) {
  return <Feather name={name} size={size} color={color} accessible={false} aria-hidden />;
}

export function Button({ children, onPress, icon, secondary = false, disabled = false }: {
  children: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, disabled && s.disabled, pressed && s.pressed]}>
    {icon && <Icon name={icon} color={secondary ? colors.green : colors.paper} size={18} />}
    <Text style={[s.buttonText, secondary && { color: colors.green }]}>{children}</Text>
  </Pressable>;
}

export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return <View style={[s.notice, warning && { backgroundColor: colors.amberBg }]}>
    <Icon name={warning ? 'alert-circle' : 'info'} color={warning ? colors.amber : colors.green} size={18} />
    <Text style={[s.noticeText, warning && { color: colors.amber }]}>{children}</Text>
  </View>;
}

export function MedicationList({ medications, onEdit, onReview }: {
  medications: Medication[]; onEdit: (medication: Medication) => void; onReview?: (id: string) => void;
}) {
  return <View style={s.stack}>{medications.map((medication, index) => <View key={medication.id} style={s.card}>
    <View style={s.row}>
      <View style={s.number}><Text style={s.numberText}>{String(index + 1).padStart(2, '0')}</Text></View>
      <View style={s.grow}>
        <Text style={s.medicationName}>{medication.name}</Text>
        <Text style={s.body}>{medication.strength}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Upravit ${medication.name}`} onPress={() => onEdit(medication)}
        style={({ pressed }) => [s.iconButton, pressed && s.pressed]}><Icon name="edit-2" size={18} /></Pressable>
    </View>
    <View style={[s.row, s.doseRow]}>
      <Icon name="clock" size={16} /><Text style={[s.body, s.grow]}>{medication.schedule}</Text>
      <Text style={s.source}>{medication.source === 'demo' ? 'Ukázková data' : 'Ruční zápis'}</Text>
    </View>
    {onReview && (medication.reviewed
      ? <View style={s.row}><Icon name="check-circle" size={16} /><Text style={s.reviewed}>Zkontrolováno vámi</Text></View>
      : <Button secondary icon="check" onPress={() => onReview(medication.id)}>Potvrdit údaje</Button>)}
  </View>)}</View>;
}

export function MedicationEditor({ medication, onClose, onSave, onDelete }: {
  medication: Medication; onClose: () => void; onSave: (medication: Medication) => void; onDelete?: () => void;
}) {
  const [name, setName] = useState(medication.name);
  const [strength, setStrength] = useState(medication.strength);
  const [schedule, setSchedule] = useState(medication.schedule);
  const [error, setError] = useState<string | null>(null);
  function save() {
    const fields = { name: name.trim(), strength: strength.trim(), schedule: schedule.trim() };
    const validation = validateMedication(fields);
    if (validation) return setError(validation);
    onSave({ ...medication, ...fields, reviewed: true });
  }
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={s.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalPosition}>
        <View accessibilityViewIsModal style={s.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.stack}>
            <View style={s.row}><Text accessibilityRole="header" style={[s.title, s.grow]}>{onDelete ? 'Upravit lék' : 'Přidat lék'}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Zavřít editor" style={s.iconButton}><Icon name="x" /></Pressable>
            </View>
            <Text style={s.body}>Opište údaje z krabičky nebo svého seznamu. Uvádějte pouze informace o léku.</Text>
            <View style={s.stack}>
              <View><Text style={s.label}>Název léku</Text><TextInput accessibilityLabel="Název léku" style={s.input} value={name} onChangeText={setName} maxLength={120} placeholder="Např. AGEN" placeholderTextColor={colors.muted} autoFocus /></View>
              <View><Text style={s.label}>Síla</Text><TextInput accessibilityLabel="Síla" style={s.input} value={strength} onChangeText={setStrength} maxLength={120} placeholder="Např. 5 mg" placeholderTextColor={colors.muted} /></View>
              <View><Text style={s.label}>Dávkování</Text><TextInput accessibilityLabel="Dávkování" style={s.input} value={schedule} onChangeText={setSchedule} maxLength={120} placeholder="Např. 1-0-0 nebo ½ tablety obden" placeholderTextColor={colors.muted} /></View>
            </View>
            {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
            <Button icon="check" onPress={save}>Uložit a potvrdit údaje</Button>
            <Button secondary onPress={onClose}>Zrušit</Button>
            {onDelete && <Pressable accessibilityRole="button" onPress={onDelete} style={s.iconButton}><Text style={s.error}>Odstranit lék ze seznamu</Text></Pressable>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

export const s = StyleSheet.create({
  stack: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  card: { padding: 22, borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: colors.paper, gap: 16 },
  eyebrow: { color: colors.green, fontWeight: '700', fontSize: 11, letterSpacing: 1.8 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.7 },
  heading: { color: colors.ink, fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { color: colors.ink, fontSize: 16, borderWidth: 1, borderColor: '#A8BCB1', borderRadius: 12, padding: 14, backgroundColor: colors.paper, minHeight: 50 },
  button: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, minHeight: 50, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.mint },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.paper, fontWeight: '600', fontSize: 15, flexShrink: 1, textAlign: 'center' },
  iconButton: { padding: 12, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  notice: { backgroundColor: colors.mint, padding: 16, borderRadius: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeText: { color: colors.green, flex: 1, lineHeight: 21, fontSize: 13 },
  number: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.green, fontWeight: '600', fontSize: 13 },
  medicationName: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  doseRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, flexWrap: 'wrap' },
  source: { color: colors.muted, fontSize: 12 },
  reviewed: { color: colors.green, fontSize: 13 },
  error: { color: colors.red, fontSize: 14, lineHeight: 21 },
  overlay: { flex: 1, backgroundColor: '#102B2580' },
  modalPosition: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: '100%', maxWidth: 500, maxHeight: '100%', padding: 24, backgroundColor: colors.background, borderRadius: 24 },
});
