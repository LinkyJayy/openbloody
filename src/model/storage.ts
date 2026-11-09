import { DRAFT_PROTOCOL, validateDefinition, type ProtocolDefinition } from '../hid/protocol';
import { getModel } from '../hid/devices';
import { defaultProfile, fitProfileToModel, uid, type Profile } from './types';

const KEY = 'openbloody:v1';

export interface PersistedState {
  modelId: string;
  profiles: Profile[];
  currentProfileId: string;
  /** Profile id stored in each on-board memory slot (as last written by this app). */
  slots: (string | null)[];
  activeSlot: number;
  protocol: ProtocolDefinition;
  allowUnverifiedWrites: boolean;
  theme: 'dark' | 'light' | 'system';
}

export function initialState(modelId = 'a70'): PersistedState {
  const model = getModel(modelId);
  const p = defaultProfile(model, 'Default');
  return {
    modelId: model.id,
    profiles: [p],
    currentProfileId: p.id,
    slots: Array.from({ length: model.memorySlots }, (_, i) => (i === 0 ? p.id : null)),
    activeSlot: 0,
    protocol: DRAFT_PROTOCOL,
    allowUnverifiedWrites: false,
    theme: 'system',
  };
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const s = JSON.parse(raw) as PersistedState;
    if (!s.profiles?.length) return initialState();
    s.protocol = s.protocol ? validateDefinition(s.protocol) : DRAFT_PROTOCOL;
    return { ...initialState(s.modelId), ...s };
  } catch {
    return initialState();
  }
}

export function saveState(s: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode / quota) – app keeps working in memory */
  }
}

export interface ProfileFile {
  format: 'openbloody-profile';
  version: 1;
  profile: Profile;
}

export function exportProfile(p: Profile): Blob {
  const file: ProfileFile = { format: 'openbloody-profile', version: 1, profile: p };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export function importProfile(text: string): Profile {
  const parsed = JSON.parse(text) as Partial<ProfileFile>;
  if (parsed.format !== 'openbloody-profile' || !parsed.profile) {
    throw new Error('Not an OpenBloody profile file.');
  }
  const model = getModel(parsed.profile.modelId);
  const base = defaultProfile(model);
  const merged = { ...base, ...parsed.profile, id: uid(), updatedAt: Date.now() } as Profile;
  return fitProfileToModel(merged, model);
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
