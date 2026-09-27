import { createContext, useContext, type ReactNode } from 'react';

import { dictionaries, type Locale, type Strings } from './strings';

const LocaleContext = createContext<Locale>('en');

/**
 * Sets the UI language for everything inside it. Immersive screens wrap themselves in
 * <LocaleScope locale="es"> so the whole interface switches to Spanish (ADR 0007).
 */
export function LocaleScope({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useT(): Strings {
  return dictionaries[useContext(LocaleContext)];
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export type { Locale, Strings };
