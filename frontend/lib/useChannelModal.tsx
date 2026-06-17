'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ChannelId } from './channels';

interface ChannelModalContextValue {
  activeChannel: ChannelId | null;
  openModal: (channel: ChannelId) => void;
  closeModal: () => void;
}

const ChannelModalContext = createContext<ChannelModalContextValue | null>(null);

export function ChannelModalProvider({ children }: { children: ReactNode }) {
  const [activeChannel, setActiveChannel] = useState<ChannelId | null>(null);

  return (
    <ChannelModalContext.Provider
      value={{
        activeChannel,
        openModal: (c) => setActiveChannel(c),
        closeModal: () => setActiveChannel(null),
      }}
    >
      {children}
    </ChannelModalContext.Provider>
  );
}

export function useChannelModal() {
  const ctx = useContext(ChannelModalContext);
  if (!ctx) throw new Error('useChannelModal must be used within ChannelModalProvider');
  return ctx;
}
