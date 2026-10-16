import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { createDemoHandoff, demoMedications, formatMedications, receiveDemoHandoff, type DemoHandoff, type Medication } from './src/medication';
import { Button, colors, Icon, MedicationEditor, MedicationList, Notice, s } from './src/ui';

type Tab = 'list' | 'photos' | 'share';
type Role = 'patient' | 'doctor';
type Photo = { id: string; uri: string; kind: 'Krabička léku' | 'Seznam léků' };
const tabs = [
  { id: 'list', label: 'Moje léky', icon: 'list' },
  { id: 'photos', label: 'Podklady', icon: 'camera' },
  { id: 'share', label: 'Předání', icon: 'send' },
] as const;

export default function App() {
  return <SafeAreaProvider><PillGaze /></SafeAreaProvider>;
}

function PillGaze() {
  const wide = useWindowDimensions().width >= 800;
  const [role, setRole] = useState<Role>('patient');
  const [tab, setTab] = useState<Tab>('list');
  // shortcut: seznam je jen v paměti; pro opakované použití doplnit chráněné lokální úložiště.
  const [medications, setMedications] = useState<Medication[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoKind, setPhotoKind] = useState<Photo['kind']>('Krabička léku');
  const [picking, setPicking] = useState(false);
  const [editor, setEditor] = useState<Medication | null>(null);
  const [handoff, setHandoff] = useState<DemoHandoff | null>(null);
  const [doctorMedications, setDoctorMedications] = useState<Medication[]>([]);
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const remaining = handoff ? Math.max(0, Math.ceil((handoff.expiresAt - now) / 1000)) : 0;
  const pending = medications.filter((medication) => !medication.reviewed).length;
  const ready = medications.length > 0 && pending === 0;

  useEffect(() => {
    if (!handoff) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [handoff]);

  function navigate(nextTab: Tab) {
    setTab(nextTab);
    setNotice(null);
    setError(null);
  }

  function updateMedications(next: Medication[]) {
    setMedications(next);
    setHandoff(null);
  }

  function newMedication() {
    setEditor({ id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: '', strength: '', schedule: '', source: 'manual', reviewed: false });
  }

  function saveMedication(medication: Medication) {
    const list = role === 'patient' ? medications : doctorMedications;
    const next = list.some((item) => item.id === medication.id)
      ? list.map((item) => item.id === medication.id ? medication : item)
      : [...list, medication];
    if (role === 'patient') updateMedications(next);
    else setDoctorMedications(next);
    setNotice(null);
    setEditor(null);
  }

  async function pickPhoto(camera: boolean) {
    setPicking(true);
    setError(null);
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Fotoaparát nemá oprávnění. Povolte ho v nastavení telefonu nebo vyberte fotku z galerie.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, exif: false, base64: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets[0]) {
        setPhotos((current) => [...current, { id: `photo-${Date.now()}`, uri: result.assets[0].uri, kind: photoKind }]);
      }
    } catch {
      setError('Fotografii se nepodařilo otevřít. Zkuste jiný snímek nebo přidejte lék ručně.');
    } finally {
      setPicking(false);
    }
  }

  function createPin() {
    setError(null);
    setNow(Date.now());
    try {
      // shortcut: náhodný PIN slouží pouze lokálnímu demu; produkční PIN musí vydávat a chránit server.
      setHandoff(createDemoHandoff(medications, String(Math.floor(Math.random() * 10000)).padStart(4, '0')));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Předání se nepodařilo připravit.');
    }
  }

  function receive() {
    setError(null);
    setNotice(null);
    try {
      setDoctorMedications(receiveDemoHandoff(handoff, pin));
      setHandoff(null);
      setPin('');
      setNotice('Seznam převzat. Tento PIN už nelze znovu použít.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Seznam se nepodařilo převzít.');
    }
  }

  async function copyList() {
    setError(null);
    setNotice(null);
    try {
      const copied = await Clipboard.setStringAsync(formatMedications(doctorMedications));
      if (!copied) throw new Error('Clipboard unavailable');
      setNotice('Seznam je ve schránce, připravený k vložení do dokumentace.');
    } catch {
      setError('Schránka není dostupná. Označte a zkopírujte text v náhledu níže.');
    }
  }

  const currentList = role === 'patient' ? medications : doctorMedications;

  return <SafeAreaView style={styles.root}>
    <StatusBar style="dark" />
    <View style={styles.header}>
      <View style={[styles.headerInner, !wide && { flexWrap: 'wrap' }]}>
        <View style={[s.row, s.grow]}>
          <View style={styles.brandIcon}><Icon name="aperture" color={colors.paper} size={25} /></View>
          <Text style={styles.brand}>pillgaze<Text style={{ color: '#6B917C' }}>.</Text></Text>
        </View>
        <View accessibilityRole="tablist" accessibilityLabel="Režim aplikace" style={styles.roleSwitch}>{(['patient', 'doctor'] as const).map((item) =>
          <Pressable key={item} accessibilityRole="tab" aria-selected={role === item}
            onPress={() => { setRole(item); setNotice(null); setError(null); }}
            style={[styles.roleButton, role === item && styles.selectedRole]}>
            <Text style={[styles.roleText, role === item && { color: colors.ink }]}>{item === 'patient' ? 'Pacient' : 'Lékař'}</Text>
          </Pressable>)}</View>
      </View>
    </View>

    <ScrollView key={`${role}-${tab}`} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <View style={s.row}><View style={styles.dot} /><Text style={s.eyebrow}>RAKATHON 2026 / PROTOTYP</Text></View>
        <View style={styles.pageHeading}>
          <Text accessibilityRole="header" style={[styles.pageTitle, !wide && { fontSize: 32 }]}>
            {role === 'doctor' ? 'Přehled pro lékaře.' : tab === 'list' ? 'Vaše léky. Přehledně.' : tab === 'photos' ? 'Začněte fotografií.' : 'Připraveno k předání.'}
          </Text>
          <Text style={s.body}>{role === 'doctor' ? 'Převezměte seznam, upravte údaje a zkopírujte je do dokumentace.' : tab === 'list' ? 'Připravte si seznam léků na příští návštěvu lékaře.' : tab === 'photos' ? 'Krabička, tištěný seznam i ručně psaná poznámka.' : 'Vyzkoušejte předání zkontrolovaného seznamu krátkým PINem.'}</Text>
        </View>
        {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {notice && <View accessibilityLiveRegion="polite"><Notice>{notice}</Notice></View>}

        {role === 'patient' && tab === 'list' && <>
          <View style={[styles.hero, wide && { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={[s.stack, s.grow]}>
              <View style={s.row}><Icon name="camera" color="#B8DDC8" /><Text style={styles.heroEyebrow}>OD KRABIČKY K SEZNAMU</Text></View>
              <Text style={styles.heroTitle}>Méně přepisování.{'\n'}Více času na vás.</Text>
              <Text style={styles.heroBody}>Přidejte podklady a doplňte léky.{`\n`}Před předáním vždy zkontrolujte údaje.</Text>
            </View>
            <Button secondary icon="plus" onPress={() => navigate('photos')}>Přidat podklady</Button>
          </View>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <Text accessibilityRole="header" style={[s.heading, s.grow]}>Můj seznam <Text style={styles.count}>{medications.length.toString().padStart(2, '0')}</Text></Text>
            <Button secondary icon="plus" onPress={newMedication}>Přidat lék</Button>
          </View>
          {medications.length === 0 ? <View style={[s.card, styles.empty]}>
            <View style={styles.emptyIcon}><Icon name="list" size={30} /></View>
            <Text style={s.heading}>První lék, první krok.</Text>
            <Text style={[s.body, { textAlign: 'center', maxWidth: 360 }]}>Váš seznam je zatím prázdný. Přidejte lék ručně nebo si projděte aplikaci s ukázkovými daty.</Text>
            <Button secondary icon="play" onPress={() => updateMedications(demoMedications.map((medication) => ({ ...medication })))}>Vyzkoušet ukázkový seznam</Button>
          </View> : <>
            <Text style={s.body}>{pending ? `Ke kontrole: ${pending}. Porovnejte název, sílu a dávkování se svými podklady.` : 'Všechny údaje jste potvrdili. Seznam můžete předat.'}</Text>
            <MedicationList medications={medications} onEdit={setEditor} onReview={(id) => updateMedications(medications.map((medication) => medication.id === id ? { ...medication, reviewed: true } : medication))} />
            <Button icon="arrow-right" disabled={!ready} onPress={() => navigate('share')}>Pokračovat k předání</Button>
          </>}
        </>}

        {role === 'patient' && tab === 'photos' && <>
          <Notice>Fotografujte pouze léky a dávkování. Jméno, rodné číslo i další osobní údaje nechte mimo záběr. Fotky se nikam neodesílají.</Notice>
          <View style={s.card}>
            <Text accessibilityRole="header" style={s.heading}>Co chcete přidat?</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Typ podkladu" style={s.row}>{(['Krabička léku', 'Seznam léků'] as const).map((kind) => <Pressable key={kind} accessibilityRole="radio" aria-checked={photoKind === kind} onPress={() => setPhotoKind(kind)} style={[styles.kind, photoKind === kind && styles.kindActive]}>
              <Icon name={kind === 'Krabička léku' ? 'package' : 'file-text'} size={26} /><Text style={styles.kindText}>{kind}</Text>
            </Pressable>)}</View>
            <Button disabled={picking} icon="camera" onPress={() => void pickPhoto(true)}>{picking ? 'Otevírám…' : 'Vyfotit podklad'}</Button>
            <Button disabled={picking} secondary icon="image" onPress={() => void pickPhoto(false)}>Vybrat z galerie</Button>
          </View>
          {photos.length > 0 && <>
            <Text accessibilityRole="header" style={s.heading}>Přidané podklady · {photos.length}</Text>
            <View style={styles.photoGrid}>{photos.map((photo) => <View key={photo.id} style={[s.card, styles.photoCard]}>
              <Image source={{ uri: photo.uri }} accessibilityLabel={photo.kind} resizeMode="contain" style={styles.photo} />
              <View style={s.row}><Text style={[s.label, s.grow]}>{photo.kind}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Odstranit podklad ${photo.kind}`} onPress={() => setPhotos(photos.filter((item) => item.id !== photo.id))} style={s.iconButton}><Icon name="trash-2" size={18} /></Pressable></View>
            </View>)}</View>
          </>}
          <Notice warning>Automatické čtení fotografií zatím není zapojené. Léky z podkladů přidejte ručně a zkontrolujte.</Notice>
          <Button icon="edit-3" onPress={newMedication}>Přepsat lék do seznamu</Button>
        </>}

        {role === 'patient' && tab === 'share' && <>
          <Notice warning>Lokální demo: PIN funguje jen po přepnutí na Lékaře v této otevřené aplikaci. Přenos do jiného zařízení zatím není zapojený.</Notice>
          <View style={[s.card, styles.empty]}>
            <View style={styles.emptyIcon}><Icon name="send" size={28} /></View>
            <Text accessibilityRole="header" style={s.heading}>{handoff && remaining > 0 ? 'Váš jednorázový PIN' : handoff ? 'Platnost PINu vypršela' : 'Seznam zůstává ve vašich rukou'}</Text>
            {handoff && remaining > 0 ? <>
              <Text selectable accessibilityLabel={`PIN ${handoff.pin}`} style={styles.pin}>{handoff.pin}</Text>
              <Text style={s.body}>Platí ještě {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</Text>
              <Text style={[s.body, { textAlign: 'center' }]}>Přepněte nahoře na Lékaře a zadejte tento kód.</Text>
              <Button secondary onPress={() => setHandoff(null)}>Zrušit PIN</Button>
            </> : <>
              <Text style={[s.body, { textAlign: 'center' }]}>{ready ? `Připravené položky: ${medications.length}. PIN bude platit 3 minuty a lze ho použít jednou.` : 'Nejdříve přidejte léky a potvrďte všechny údaje v seznamu.'}</Text>
              <Button disabled={!ready} icon="key" onPress={createPin}>{handoff ? 'Vytvořit nový PIN' : 'Vytvořit demo PIN'}</Button>
              {!ready && <Button secondary onPress={() => navigate('list')}>Zpět na seznam</Button>}
            </>}
          </View>
          <View style={s.card}><Text style={s.heading}>Co se předává?</Text><Text style={s.body}>Pouze název léku, síla a dávkování. Fotografie ani identifikační údaje do textového exportu nevstupují.</Text></View>
        </>}

        {role === 'doctor' && <>
          <Notice warning>Ukázka pracovního rozhraní. Pro převzetí vytvořte PIN v části Pacient → Předání ve stejné otevřené aplikaci.</Notice>
          <View style={s.card}>
            <Text accessibilityRole="header" style={s.heading}>Převzít seznam pacienta</Text>
            <Text style={s.body}>Zadejte čtyřmístný PIN. Nový seznam nahradí aktuální pracovní kopii.</Text>
            <View style={[s.row, !wide && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <TextInput accessibilityLabel="Čtyřmístný PIN" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="0000" placeholderTextColor={colors.muted} style={[s.input, wide && s.grow, { letterSpacing: 8, fontSize: 24 }]} onSubmitEditing={receive} />
              <Button icon="download" disabled={pin.length !== 4} onPress={receive}>Převzít seznam</Button>
            </View>
          </View>
          {doctorMedications.length > 0 && <>
            <View style={[s.row, { flexWrap: 'wrap' }]}><Text accessibilityRole="header" style={[s.heading, s.grow]}>Pracovní seznam · {doctorMedications.length}</Text><Button secondary icon="plus" onPress={newMedication}>Přidat lék</Button></View>
            <MedicationList medications={doctorMedications} onEdit={setEditor} />
            <View style={s.card}>
              <Text style={s.heading}>Text pro dokumentaci</Text>
              <Text selectable style={styles.exportText}>{formatMedications(doctorMedications)}</Text>
              <Button icon="copy" onPress={() => void copyList()}>Zkopírovat do schránky</Button>
            </View>
            <View style={s.card}><View style={s.row}><Icon name="activity" /><Text style={s.heading}>Klinické nástroje</Text></View>
              <Text style={s.body}>Kontrola interakcí a rozpoznání onkologických režimů zatím nejsou zapojené. Seznam nebyl klinicky vyhodnocen.</Text>
            </View>
          </>}
        </>}

        <View style={styles.footer}><Icon name="lock" size={15} /><Text style={styles.footerText}>Bez účtu. Data jen v paměti této relace. Obnovením aplikace se smažou.</Text></View>
      </View>
    </ScrollView>

    {role === 'patient' && <View style={styles.nav}><View accessibilityRole="tablist" accessibilityLabel="Části aplikace" style={styles.navInner}>{tabs.map((item) => <Pressable key={item.id} onPress={() => navigate(item.id)} accessibilityRole="tab" aria-selected={tab === item.id} style={[styles.navItem, tab === item.id && styles.navActive]}>
      <Icon name={item.icon} color={tab === item.id ? colors.green : colors.muted} /><Text style={[styles.navLabel, tab === item.id && { color: colors.green, fontWeight: '700' }]}>{item.label}</Text>
    </Pressable>)}</View></View>}

    {editor && <MedicationEditor key={editor.id} medication={editor} onClose={() => setEditor(null)} onSave={saveMedication}
      onDelete={currentList.some((medication) => medication.id === editor.id) ? () => {
        const next = currentList.filter((medication) => medication.id !== editor.id);
        if (role === 'patient') updateMedications(next); else setDoctorMedications(next);
        setEditor(null);
        setNotice(null);
      } : undefined} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 20 },
  headerInner: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingVertical: 17, flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 26, fontWeight: '800', letterSpacing: -1.3, color: colors.ink },
  roleSwitch: { flexDirection: 'row', padding: 4, backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  roleButton: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 8 },
  selectedRole: { backgroundColor: colors.paper },
  roleText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  scroll: { flexGrow: 1, padding: 22, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', gap: 24 },
  dot: { width: 7, height: 7, backgroundColor: colors.green, borderRadius: 4 },
  pageHeading: { gap: 9, marginBottom: 4 },
  pageTitle: { color: colors.ink, fontWeight: '700', letterSpacing: -1.6, fontSize: 42, lineHeight: 49 },
  hero: { backgroundColor: colors.ink, padding: 26, borderRadius: 22, gap: 24 },
  heroEyebrow: { color: '#B8DDC8', fontSize: 10, letterSpacing: 1.6, fontWeight: '600' },
  heroTitle: { color: colors.paper, fontWeight: '600', fontSize: 28, lineHeight: 35, letterSpacing: -0.6 },
  heroBody: { color: '#CADBD3', fontSize: 14, lineHeight: 22 },
  count: { color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 18 },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  kind: { flex: 1, gap: 12, alignItems: 'center', paddingVertical: 22, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14 },
  kindActive: { backgroundColor: colors.mint, borderColor: colors.green },
  kindText: { fontSize: 14, fontWeight: '600', color: colors.green, textAlign: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  photoCard: { flexGrow: 1, flexBasis: 260, padding: 14 },
  photo: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#EBEFEC' },
  pin: { fontSize: 58, letterSpacing: 14, color: colors.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
  exportText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.ink, fontSize: 14, lineHeight: 24 },
  footer: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 8 },
  footerText: { color: colors.muted, fontSize: 12, lineHeight: 19, flexShrink: 1 },
  nav: { backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 10 },
  navInner: { flexDirection: 'row', width: '100%', maxWidth: 600, alignSelf: 'center', gap: 8 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 6, borderRadius: 12 },
  navActive: { backgroundColor: colors.mint },
  navLabel: { fontSize: 12, color: colors.muted },
});
