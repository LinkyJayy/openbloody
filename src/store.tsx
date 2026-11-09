import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getModel, identifyModel, type MouseModel } from './hid/devices';
import { buildPacket, buildProfilePackets, DRAFT_PROTOCOL, type Packet, type ProtocolDefinition } from './hid/protocol';
import { SimulatedTransport } from './hid/simulator';
import {
  log,
  reconnectKnownDevice,
  requestBloodyDevice,
  sendPackets,
  subscribeLog,
  type LogEntry,
  type Transport,
} from './hid/transport';
import { loadState, saveState, type PersistedState } from './model/storage';
import { defaultProfile, fitProfileToModel, uid, type Profile } from './model/types';

export interface WriteProgress {
  done: number;
  total: number;
  label: string;
}

interface Store {
  state: PersistedState;
  model: MouseModel;
  profile: Profile;
  transport: Transport | null;
  deviceInfo: Uint8Array | null;
  logs: LogEntry[];
  progress: WriteProgress | null;
  dirty: boolean;
  canWrite: boolean;
  setState: (fn: (s: PersistedState) => PersistedState) => void;
  updateProfile: (fn: (p: Profile) => Profile) => void;
  setModel: (id: string) => void;
  newProfile: (name?: string) => void;
  duplicateProfile: (id: string) => void;
  deleteProfile: (id: string) => void;
  selectProfile: (id: string) => void;
  addProfile: (p: Profile) => void;
  connect: () => Promise<void>;
  connectSimulator: () => void;
  disconnect: () => Promise<void>;
  previewPackets: (slot?: number) => Packet[];
  writeToMouse: (slot?: number) => Promise<void>;
  factoryReset: () => Promise<void>;
  readInfo: () => Promise<void>;
  clearLogs: () => void;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  toasts: { id: number; msg: string; kind: 'ok' | 'error' }[];
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<PersistedState>(loadState);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<Uint8Array | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<WriteProgress | null>(null);
  const [writtenAt, setWrittenAt] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Store['toasts']>([]);
  const toastId = useRef(0);

  const model = getModel(state.modelId);
  const profile = state.profiles.find((p) => p.id === state.currentProfileId) ?? state.profiles[0];

  useEffect(() => saveState(state), [state]);
  useEffect(
    () =>
      subscribeLog((e) =>
        setLogs((l) => {
          const next = l.length > 500 ? l.slice(-400) : l.slice();
          next.push(e);
          return next;
        }),
      ),
    [],
  );

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const setState = useCallback((fn: (s: PersistedState) => PersistedState) => setStateRaw(fn), []);

  const updateProfile = useCallback(
    (fn: (p: Profile) => Profile) =>
      setStateRaw((s) => ({
        ...s,
        profiles: s.profiles.map((p) =>
          p.id === s.currentProfileId ? { ...fn(p), updatedAt: Date.now() } : p,
        ),
      })),
    [],
  );

  const setModel = useCallback((id: string) => {
    const m = getModel(id);
    setStateRaw((s) => ({
      ...s,
      modelId: m.id,
      profiles: s.profiles.map((p) => fitProfileToModel(p, m)),
      slots: Array.from({ length: m.memorySlots }, (_, i) => s.slots[i] ?? null),
      activeSlot: Math.min(s.activeSlot, m.memorySlots - 1),
    }));
  }, []);

  const addProfile = useCallback((p: Profile) => {
    setStateRaw((s) => ({ ...s, profiles: [...s.profiles, p], currentProfileId: p.id }));
  }, []);

  const newProfile = useCallback(
    (name?: string) => addProfile(defaultProfile(model, name ?? `Profile ${state.profiles.length + 1}`)),
    [addProfile, model, state.profiles.length],
  );

  const duplicateProfile = useCallback(
    (id: string) => {
      const src = state.profiles.find((p) => p.id === id);
      if (src) addProfile({ ...structuredClone(src), id: uid(), name: `${src.name} copy`, updatedAt: Date.now() });
    },
    [addProfile, state.profiles],
  );

  const deleteProfile = useCallback((id: string) => {
    setStateRaw((s) => {
      if (s.profiles.length <= 1) return s;
      const profiles = s.profiles.filter((p) => p.id !== id);
      return {
        ...s,
        profiles,
        currentProfileId: s.currentProfileId === id ? profiles[0].id : s.currentProfileId,
        slots: s.slots.map((x) => (x === id ? null : x)),
      };
    });
  }, []);

  const selectProfile = useCallback((id: string) => setStateRaw((s) => ({ ...s, currentProfileId: id })), []);

  const attach = useCallback(
    async (t: Transport) => {
      setTransport(t);
      const guess = identifyModel(t.productName);
      if (guess && !t.simulated) {
        setModel(guess.id);
        log({ dir: 'info', text: `Identified as ${guess.name}` });
      }
      const def = t.simulated ? DRAFT_PROTOCOL : state.protocol;
      if (!t.simulated && !def.verified && !state.allowUnverifiedWrites) {
        log({ dir: 'info', text: 'Skipping info query: protocol definition is unverified. Use the Protocol Lab to probe.' });
        setDeviceInfo(null);
        return;
      }
      try {
        const pkt = buildPacket(def, 'getInfo');
        if (def.transport === 'feature') await t.sendFeature(pkt.reportId, pkt.data);
        else await t.sendOutput(pkt.reportId, pkt.data);
        setDeviceInfo(await t.receiveFeature(def.reportId));
      } catch (e) {
        log({ dir: 'error', text: `Info query failed: ${(e as Error).message}` });
        setDeviceInfo(null);
      }
    },
    [setModel, state.protocol, state.allowUnverifiedWrites],
  );

  const connect = useCallback(async () => {
    try {
      const t = await requestBloodyDevice();
      if (!t) return;
      await attach(t);
      toast(`Connected to ${t.name}`);
    } catch (e) {
      const msg = (e as Error).message;
      log({ dir: 'error', text: msg });
      toast(msg, 'error');
    }
  }, [attach, toast]);

  // Silently re-open a device the user already granted access to.
  useEffect(() => {
    reconnectKnownDevice()
      .then((t) => t && attach(t))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!('hid' in navigator)) return;
    const onDisconnect = () => {
      setTransport((t) => {
        if (t && !t.simulated) {
          log({ dir: 'info', text: 'Device unplugged' });
          return null;
        }
        return t;
      });
    };
    navigator.hid.addEventListener('disconnect', onDisconnect);
    return () => navigator.hid.removeEventListener('disconnect', onDisconnect);
  }, []);

  const connectSimulator = useCallback(() => {
    const t = new SimulatedTransport(model, DRAFT_PROTOCOL);
    void attach(t);
    toast(`Simulator connected (${model.name})`);
  }, [attach, model, toast]);

  const disconnect = useCallback(async () => {
    await transport?.close();
    setTransport(null);
    setDeviceInfo(null);
  }, [transport]);

  const canWrite = !!transport && (transport.simulated || state.protocol.verified || state.allowUnverifiedWrites);

  const previewPackets = useCallback(
    (slot = state.activeSlot) =>
      buildProfilePackets(profile, model, transport?.simulated ? DRAFT_PROTOCOL : state.protocol, { slot, save: true }),
    [profile, model, state.protocol, state.activeSlot, transport],
  );

  const writeToMouse = useCallback(
    async (slot = state.activeSlot) => {
      if (!transport) throw new Error('No mouse connected');
      if (!canWrite) throw new Error('Writes are disabled for an unverified protocol definition.');
      const def = transport.simulated ? DRAFT_PROTOCOL : state.protocol;
      const packets = buildProfilePackets(profile, model, def, { slot, save: true });
      try {
        await sendPackets(transport, def, packets, (done, total, label) => setProgress({ done, total, label }));
        setStateRaw((s) => ({ ...s, slots: s.slots.map((x, i) => (i === slot ? profile.id : x)), activeSlot: slot }));
        setWrittenAt((w) => ({ ...w, [profile.id]: profile.updatedAt }));
        toast(`Wrote "${profile.name}" to memory slot ${slot + 1} (${packets.length} packets)`);
      } catch (e) {
        toast(`Write failed: ${(e as Error).message}`, 'error');
        log({ dir: 'error', text: (e as Error).message });
      } finally {
        setTimeout(() => setProgress(null), 600);
      }
    },
    [transport, canWrite, state.protocol, state.activeSlot, profile, model, toast],
  );

  const factoryReset = useCallback(async () => {
    if (!transport || !canWrite) return;
    const def = transport.simulated ? DRAFT_PROTOCOL : state.protocol;
    await sendPackets(transport, def, [buildPacket(def, 'factoryReset', {}, 'Factory reset')]);
    setStateRaw((s) => ({ ...s, slots: s.slots.map(() => null) }));
    toast('Factory reset sent');
  }, [transport, canWrite, state.protocol, toast]);

  const readInfo = useCallback(async () => {
    if (transport) await attach(transport);
  }, [transport, attach]);

  const value = useMemo<Store>(
    () => ({
      state,
      model,
      profile,
      transport,
      deviceInfo,
      logs,
      progress,
      dirty: writtenAt[profile.id] !== profile.updatedAt,
      canWrite,
      setState,
      updateProfile,
      setModel,
      newProfile,
      duplicateProfile,
      deleteProfile,
      selectProfile,
      addProfile,
      connect,
      connectSimulator,
      disconnect,
      previewPackets,
      writeToMouse,
      factoryReset,
      readInfo,
      clearLogs: () => setLogs([]),
      toast,
      toasts,
    }),
    [
      state, model, profile, transport, deviceInfo, logs, progress, writtenAt, canWrite, setState, updateProfile,
      setModel, newProfile, duplicateProfile, deleteProfile, selectProfile, addProfile, connect, connectSimulator,
      disconnect, previewPackets, writeToMouse, factoryReset, readInfo, toast, toasts,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { ProtocolDefinition };
