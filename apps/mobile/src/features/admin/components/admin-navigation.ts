import type { AdminAccess } from '@/services/admin-control-api';
import { hasAnyAdminPermission } from '@/services/admin-control-api';

export type AdminHref =
  | '/admin'
  | '/admin/queue'
  | '/admin/search'
  | '/admin/governance'
  | '/admin/market-publishing'
  | '/admin/revenue'
  | '/admin/fees'
  | '/admin/payments'
  | '/admin/compliance'
  | '/admin/users'
  | '/admin/content'
  | '/admin/home-content'
  | '/admin/providers'
  | '/admin/ai'
  | '/admin/roles'
  | '/admin/service-controls';

export type AdminNavItem = {
  label: string;
  shortLabel: string;
  href: AdminHref;
  description: string;
  permissions: string[];
  superAdminOnly?: boolean;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const adminNavigationGroups: AdminNavGroup[] = [
  {
    label: 'Command',
    items: [
      {
        label: 'Overview',
        shortLabel: 'Home',
        href: '/admin',
        description: 'Platform status and operational attention',
        permissions: [],
      },
      {
        label: 'Work Queue',
        shortLabel: 'Queue',
        href: '/admin/queue',
        description: 'Open action items across the areas you can manage',
        permissions: [],
      },
      {
        label: 'Search',
        shortLabel: 'Search',
        href: '/admin/search',
        description: 'Find operations areas and records available to your role',
        permissions: [],
      },
    ],
  },
  {
    label: 'Markets',
    items: [
      {
        label: 'Markets & Oracle',
        shortLabel: 'Markets',
        href: '/admin/governance',
        description: 'Market proposals, interventions and resolution',
        permissions: ['markets.manage', 'oracle.review'],
      },
      {
        label: 'Publish & Feature',
        shortLabel: 'Publish',
        href: '/admin/market-publishing',
        description: 'Publish approved markets and curate Home features',
        permissions: ['markets.manage'],
      },
    ],
  },
  {
    label: 'Money',
    items: [
      {
        label: 'VAD Revenue',
        shortLabel: 'Revenue',
        href: '/admin/revenue',
        description: 'VAD fee income by source',
        permissions: ['finance.read'],
      },
      {
        label: 'Fee Controls',
        shortLabel: 'Fees',
        href: '/admin/fees',
        description: 'Set or propose trading, settlement and payment fees',
        permissions: ['fees.propose', 'policies.manage'],
      },
      {
        label: 'Payments',
        shortLabel: 'Payments',
        href: '/admin/payments',
        description: 'Payments, withdrawals and refunds',
        permissions: ['finance.read', 'payments.refund'],
      },
    ],
  },
  {
    label: 'Trust & Safety',
    items: [
      {
        label: 'KYC & Compliance',
        shortLabel: 'KYC',
        href: '/admin/compliance',
        description: 'Identity verification and compliance review',
        permissions: ['compliance.manage', 'support.read'],
      },
      {
        label: 'Users',
        shortLabel: 'Users',
        href: '/admin/users',
        description: 'Account review, restrictions and bans',
        permissions: ['users.manage', 'support.read', 'admin.roles.manage'],
      },
      {
        label: 'Content',
        shortLabel: 'Content',
        href: '/admin/content',
        description: 'Moderation and content restoration',
        permissions: ['content.moderate'],
      },
      {
        label: 'Home Content',
        shortLabel: 'Home',
        href: '/admin/home-content',
        description: 'Promotional banners and public awareness notices',
        permissions: ['content.moderate'],
      },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      {
        label: 'Providers',
        shortLabel: 'Providers',
        href: '/admin/providers',
        description: 'Provider status and approval changes',
        permissions: ['providers.manage', 'finance.read'],
      },
      {
        label: 'AI Routing',
        shortLabel: 'AI',
        href: '/admin/ai',
        description: 'AI model settings used for market proposal review',
        permissions: ['providers.manage'],
      },
    ],
  },
  {
    label: 'Access & Platform',
    items: [
      {
        label: 'Service Controls',
        shortLabel: 'Controls',
        href: '/admin/service-controls',
        description: 'Immediate Super Admin pause and resume controls',
        permissions: [],
        superAdminOnly: true,
      },
      {
        label: 'Roles & Access',
        shortLabel: 'Access',
        href: '/admin/roles',
        description: 'Operational roles and authority',
        permissions: ['admin.roles.manage'],
      },
    ],
  },
];

export function getVisibleAdminGroups(access: AdminAccess) {
  return adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superAdminOnly && !access.isSuperAdmin) return false;
        return (
          item.permissions.length === 0 ||
          hasAnyAdminPermission(access, item.permissions)
        );
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function getAdminPageMeta(pathname: string, access: AdminAccess) {
  const groups = getVisibleAdminGroups(access);
  const items = groups.flatMap((group) => group.items);
  const exact = items.find((item) => item.href === pathname);
  const nested = items
    .filter((item) => item.href !== '/admin')
    .find((item) => pathname.startsWith(`${item.href}/`));

  return (
    exact ??
    nested ?? {
      label: 'VAD Operations',
      shortLabel: 'Operations',
      href: '/admin' as const,
      description: 'Administrative tools available to your role',
      permissions: [],
    }
  );
}

export function isAdminItemSelected(pathname: string, href: AdminHref) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
