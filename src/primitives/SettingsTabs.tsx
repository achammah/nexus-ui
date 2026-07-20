import * as React from "react";
import "./primitives.css";

/* Generic settings tab shell — a sticky tab bar over a body region. The caller
   supplies tabs as config (label/icon/render); this component owns only the
   active-tab state and the shell chrome. Page head (title/lede) is app content,
   not this primitive's concern. */

export interface SettingsTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
  render: () => React.ReactNode;
}

export interface SettingsTabsProps {
  tabs: SettingsTab[];
  defaultKey?: string;
}

export function SettingsTabs({ tabs, defaultKey }: SettingsTabsProps) {
  const [active, setActive] = React.useState<string>(defaultKey ?? tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="nxSetRoot">
      <div className="nxSetTabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`nxSetTab${t.key === active ? " is-on" : ""}`}
            data-testid={`settings-tab-${t.key}`}
            onClick={() => setActive(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="nxSetBody">{current?.render()}</div>
    </div>
  );
}
