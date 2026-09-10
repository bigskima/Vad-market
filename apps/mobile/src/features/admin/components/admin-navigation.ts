import type { AdminAccess } from '@/services/admin-control-api';
import { hasAnyAdminPermission } from '@/services/admin-control-api';

export type AdminHref =
  | '/admin'
  | '/admin/queue'
  | '/admin/search'
  | '/admin/governance'
  | '/admin/payments'
  | '/admin/compliance'
  | '/admin/users'
  | '/admin/content'
  | '/admin/providers'
  | '/admin/roles';

export type AdminNavItem = {
  label: string;
  shortLabel: string;
  href: AdminHref;
  description: string;
  permissions: string[];
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
        description: 'Actionable records across your permitted domains',
        permissions: [],
      },
      {
        label: 'Search',
        shortLabel: 'Search',
        href: '/admin/search',
        description: 'Find permitted operations areas and records',
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
    ],
  },
  {
    label: 'Money',
    items: [
      {
        label: 'Payments',
        shortLabel: 'Money',
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
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      {
        label: 'Providers',
        shortLabel: 'Providers',
        href: '/admin/providers',
        description: 'Provider readiness and governed changes',
        permissions: ['providers.manage', 'finance.read'],
      },
    ],
  },
  {
    label: 'Access & Platform',
    items: [
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
      items: group.items.filter(
        (item) =>
          item.permissions.length === 0 ||
          hasAnyAdminPermission(access, item.permissions),
      ),
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
      description: 'Permission-scoped operational control plane',
      permissions: [],
    }
  );
}

export function isAdminItemSelected(pathname: string, href: AdminHref) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}
