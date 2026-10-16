export type Medication = {
  id: string;
  name: string;
  strength: string;
  schedule: string;
  source: 'manual' | 'demo';
  reviewed: boolean;
};

export type MedicationFields = Pick<Medication, 'name' | 'strength' | 'schedule'>;

export function validateMedication(fields: MedicationFields): string | null {
  const values = [fields.name, fields.strength, fields.schedule];
  if (values.some((value) => !value.trim())) {
    return 'Vyplňte název, sílu i dávkování podle svého seznamu.';
  }
  if (values.some((value) => value.length > 120 || /[\r\n\t]/.test(value))) {
    return 'Každé pole musí mít nejvýše 120 znaků a být na jednom řádku.';
  }
  return null;
}

export function formatMedications(medications: Medication[]): string {
  return medications.map(({ name, strength, schedule }) =>
    `${name.trim()}\t${strength.trim()}\t${schedule.trim()}`,
  ).join('\n');
}

// Modelový seznam „Pacient 1“ z assets/Data/50_Pacientu.md; nejde o doporučení léčby.
export const demoMedications: Medication[] = [
  { id: 'demo-1', name: 'AGEN', strength: '5 mg', schedule: '1-0-0', source: 'demo', reviewed: false },
  { id: 'demo-2', name: 'AERIUS', strength: '5 mg', schedule: '0-0-1', source: 'demo', reviewed: false },
  { id: 'demo-3', name: 'MAGNESII LACTICI 0,5 TBL. MEDICAMENTA', strength: '0,5 g', schedule: '1-0-1', source: 'demo', reviewed: false },
];

export type DemoHandoff = {
  pin: string;
  expiresAt: number;
  medications: Medication[];
};

// shortcut: předání existuje jen v paměti jedné aplikace; před propojením zařízení nahradit serverovým transportem.
export function createDemoHandoff(medications: Medication[], pin: string, now = Date.now()): DemoHandoff {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN musí mít čtyři číslice.');
  if (!medications.length || medications.some((medication) => !medication.reviewed || validateMedication(medication))) {
    throw new Error('Nejdříve zkontrolujte všechny léky v seznamu.');
  }
  return { pin, expiresAt: now + 180_000, medications: medications.map((medication) => ({ ...medication })) };
}

export function receiveDemoHandoff(handoff: DemoHandoff | null, pin: string, now = Date.now()): Medication[] {
  if (!handoff || now >= handoff.expiresAt || !/^\d{4}$/.test(pin) || pin !== handoff.pin) {
    throw new Error('PIN není platný nebo už vypršel. Vytvořte nový v části Předání.');
  }
  return handoff.medications.map((medication) => ({ ...medication }));
}
