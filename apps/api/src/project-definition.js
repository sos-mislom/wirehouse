export const solutionContour = {
  modules: [
    "identity-and-access",
    "crm",
    "billing",
    "service-desk",
    "notifications",
    "analytics",
    "visualization"
  ],
  channels: ["web", "android", "desktop", "email", "telegram", "vk"],
  applications: [
    {
      id: "web",
      purpose: "Adaptive browser UI for all roles"
    },
    {
      id: "android",
      purpose: "Capacitor shell for tenant and worker mobile-first flows"
    },
    {
      id: "desktop-windows",
      purpose: "Electron desktop shell with NSIS installer for staff"
    },
    {
      id: "telegram-notifier",
      purpose: "Telegram notification adapter and tenant/worker bot entry point"
    },
    {
      id: "vk-notifier",
      purpose: "VK notification adapter and tenant/worker bot entry point"
    }
  ],
  visualizationSurfaces: [
    "digital-twin",
    "smart-gallery",
    "sla-heatmap",
    "lease-risk-timeline"
  ]
};

export const erFindings = [
  "Invoice naming conflicts with Payment wording from the specification.",
  "Tenant risk level is required by dashboard forecast but missing in the ER.",
  "Property needs rentable area and warehouse class.",
  "Ticket should track source channel for web, Android, desktop, Telegram, VK, and phone.",
  "Notification should include channel and delivery status."
];

export const openQuestions = [
  "Are floor plans or BIM/CAD sources available for digital twin views?"
];
