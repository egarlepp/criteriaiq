
import { describe, it, expect, beforeEach } from 'vitest';
import { makeComparator, stableSort, type SortConfig } from '../sorting';

describe('Table Sorting Integration Tests', () => {
  // Mock data for email logs
  const mockEmailLogs = [
    {
      id: 1,
      sentAt: '2023-01-15T10:30:00Z',
      toEmail: 'john@example.com',
      subject: 'Project Update',
      projectName: 'Alpha Project',
      status: 'sent'
    },
    {
      id: 2,
      sentAt: '2023-01-14T14:20:00Z',
      toEmail: 'jane@example.com',
      subject: 'Weekly Report',
      projectName: 'Beta Project',
      status: 'failed'
    },
    {
      id: 3,
      sentAt: '2023-01-16T09:15:00Z',
      toEmail: 'admin@example.com',
      subject: 'System Alert',
      projectName: null,
      status: 'pending'
    }
  ];

  // Mock data for email designs
  const mockEmailDesigns = [
    {
      id: 1,
      name: 'Default Template',
      description: 'Standard email template',
      isSystemDesign: true,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-10T12:00:00Z'
    },
    {
      id: 2,
      name: 'Custom Template',
      description: 'Custom branded template',
      isSystemDesign: false,
      createdAt: '2023-01-05T00:00:00Z',
      updatedAt: '2023-01-15T14:30:00Z'
    }
  ];

  // Mock data for audit logs
  const mockAuditLogs = [
    {
      id: 1,
      userEmail: 'admin@example.com',
      action: 'LOGIN',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      createdAt: '2023-01-15T10:30:00Z'
    },
    {
      id: 2,
      userEmail: 'user@example.com',
      action: 'LOGOUT',
      ipAddress: '192.168.1.2',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      createdAt: '2023-01-14T16:45:00Z'
    }
  ];

  // Mock data for archived entities
  const mockArchivedUsers = [
    {
      id: 1,
      email: 'former@example.com',
      firstName: 'John',
      lastName: 'Doe',
      archivedAt: '2023-01-10T00:00:00Z',
      archivedBy: 'admin@example.com'
    },
    {
      id: 2,
      email: 'old@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      archivedAt: '2023-01-12T00:00:00Z',
      archivedBy: 'admin@example.com'
    }
  ];

  describe('Email Logs Sorting', () => {
    it('should sort by sentAt date correctly', () => {
      const sortConfig: SortConfig = { key: 'sentAt', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailLogs, comparator);

      expect(sorted[0].id).toBe(2); // 2023-01-14
      expect(sorted[1].id).toBe(1); // 2023-01-15
      expect(sorted[2].id).toBe(3); // 2023-01-16
    });

    it('should sort by email address correctly', () => {
      const sortConfig: SortConfig = { key: 'toEmail', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailLogs, comparator);

      expect(sorted[0].toEmail).toBe('admin@example.com');
      expect(sorted[1].toEmail).toBe('jane@example.com');
      expect(sorted[2].toEmail).toBe('john@example.com');
    });

    it('should handle null project names correctly', () => {
      const sortConfig: SortConfig = { key: 'projectName', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailLogs, comparator);

      // Null values should be sorted to the end
      expect(sorted[2].projectName).toBe(null);
    });

    it('should sort by status correctly', () => {
      const sortConfig: SortConfig = { key: 'status', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailLogs, comparator);

      expect(sorted[0].status).toBe('failed');
      expect(sorted[1].status).toBe('pending');
      expect(sorted[2].status).toBe('sent');
    });
  });

  describe('Email Designs Sorting', () => {
    it('should sort by name correctly', () => {
      const sortConfig: SortConfig = { key: 'name', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailDesigns, comparator);

      expect(sorted[0].name).toBe('Custom Template');
      expect(sorted[1].name).toBe('Default Template');
    });

    it('should sort by system design flag correctly', () => {
      const sortConfig: SortConfig = { key: 'isSystemDesign', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailDesigns, comparator);

      expect(sorted[0].isSystemDesign).toBe(false);
      expect(sorted[1].isSystemDesign).toBe(true);
    });

    it('should sort by creation date correctly', () => {
      const sortConfig: SortConfig = { key: 'createdAt', direction: 'desc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockEmailDesigns, comparator);

      expect(sorted[0].id).toBe(2); // 2023-01-05
      expect(sorted[1].id).toBe(1); // 2023-01-01
    });
  });

  describe('Audit Logs Sorting', () => {
    it('should sort by user email correctly', () => {
      const sortConfig: SortConfig = { key: 'userEmail', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockAuditLogs, comparator);

      expect(sorted[0].userEmail).toBe('admin@example.com');
      expect(sorted[1].userEmail).toBe('user@example.com');
    });

    it('should sort by action correctly', () => {
      const sortConfig: SortConfig = { key: 'action', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockAuditLogs, comparator);

      expect(sorted[0].action).toBe('LOGIN');
      expect(sorted[1].action).toBe('LOGOUT');
    });

    it('should sort by timestamp correctly', () => {
      const sortConfig: SortConfig = { key: 'createdAt', direction: 'desc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockAuditLogs, comparator);

      expect(sorted[0].id).toBe(1); // 2023-01-15
      expect(sorted[1].id).toBe(2); // 2023-01-14
    });
  });

  describe('Archived Users Sorting', () => {
    it('should sort by full name correctly', () => {
      const sortConfig: SortConfig = { key: 'firstName', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedUsers, comparator);

      expect(sorted[0].firstName).toBe('Jane');
      expect(sorted[1].firstName).toBe('John');
    });

    it('should sort by email correctly', () => {
      const sortConfig: SortConfig = { key: 'email', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedUsers, comparator);

      expect(sorted[0].email).toBe('former@example.com');
      expect(sorted[1].email).toBe('old@example.com');
    });

    it('should sort by archived date correctly', () => {
      const sortConfig: SortConfig = { key: 'archivedAt', direction: 'desc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedUsers, comparator);

      expect(sorted[0].id).toBe(2); // 2023-01-12
      expect(sorted[1].id).toBe(1); // 2023-01-10
    });
  });

  describe('Stable Sorting Behavior', () => {
    it('should preserve order of equal elements', () => {
      const dataWithDuplicates = [
        { id: 1, name: 'Alice', priority: 1, order: 1 },
        { id: 2, name: 'Bob', priority: 1, order: 2 },
        { id: 3, name: 'Alice', priority: 2, order: 3 },
        { id: 4, name: 'Bob', priority: 1, order: 4 }
      ];

      const sortConfig: SortConfig = { key: 'priority', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(dataWithDuplicates, comparator);

      // Items with priority 1 should maintain their original order
      const priority1Items = sorted.filter(item => item.priority === 1);
      expect(priority1Items[0].order).toBe(1);
      expect(priority1Items[1].order).toBe(2);
      expect(priority1Items[2].order).toBe(4);
    });
  });

  describe('URL State Integration', () => {
    it('should handle nested field sorting', () => {
      const nestedData = [
        { id: 1, user: { profile: { name: 'Charlie' } } },
        { id: 2, user: { profile: { name: 'Alice' } } },
        { id: 3, user: { profile: { name: 'Bob' } } }
      ];

      const sortConfig: SortConfig = { key: 'user.profile.name', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(nestedData, comparator);

      expect(sorted[0].user.profile.name).toBe('Alice');
      expect(sorted[1].user.profile.name).toBe('Bob');
      expect(sorted[2].user.profile.name).toBe('Charlie');
    });

    it('should handle direction changes correctly', () => {
      const sortConfigAsc: SortConfig = { key: 'name', direction: 'asc' };
      const sortConfigDesc: SortConfig = { key: 'name', direction: 'desc' };
      
      const data = [
        { name: 'Charlie' },
        { name: 'Alice' },
        { name: 'Bob' }
      ];

      const ascComparator = makeComparator(sortConfigAsc);
      const descComparator = makeComparator(sortConfigDesc);
      
      const ascSorted = stableSort(data, ascComparator);
      const descSorted = stableSort(data, descComparator);

      expect(ascSorted[0].name).toBe('Alice');
      expect(ascSorted[2].name).toBe('Charlie');
      
      expect(descSorted[0].name).toBe('Charlie');
      expect(descSorted[2].name).toBe('Alice');
    });
  });

  describe('Archived Projects Sorting', () => {
    const mockArchivedProjects = [
      {
        id: 1,
        name: 'Legacy System Migration',
        customerName: 'Acme Corp',
        status: 'Completed',
        archivedAt: '2023-01-10T00:00:00Z',
        archivedBy: 'admin@example.com'
      },
      {
        id: 2,
        name: 'Data Warehouse Setup',
        customerName: 'Beta Inc',
        status: 'Cancelled',
        archivedAt: '2023-01-12T00:00:00Z',
        archivedBy: 'manager@example.com'
      }
    ];

    it('should sort by project name correctly', () => {
      const sortConfig: SortConfig = { key: 'name', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedProjects, comparator);

      expect(sorted[0].name).toBe('Data Warehouse Setup');
      expect(sorted[1].name).toBe('Legacy System Migration');
    });

    it('should sort by customer name correctly', () => {
      const sortConfig: SortConfig = { key: 'customerName', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedProjects, comparator);

      expect(sorted[0].customerName).toBe('Acme Corp');
      expect(sorted[1].customerName).toBe('Beta Inc');
    });
  });

  describe('Archived Customers Sorting', () => {
    const mockArchivedCustomers = [
      {
        id: 1,
        accountName: 'Tech Solutions Ltd',
        industry: 'Technology',
        projectsCount: 5,
        archivedAt: '2023-01-10T00:00:00Z',
        archivedBy: 'admin@example.com'
      },
      {
        id: 2,
        accountName: 'Healthcare Partners',
        industry: 'Healthcare',
        projectsCount: 12,
        archivedAt: '2023-01-12T00:00:00Z',
        archivedBy: 'manager@example.com'
      }
    ];

    it('should sort by account name correctly', () => {
      const sortConfig: SortConfig = { key: 'accountName', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedCustomers, comparator);

      expect(sorted[0].accountName).toBe('Healthcare Partners');
      expect(sorted[1].accountName).toBe('Tech Solutions Ltd');
    });

    it('should sort by projects count correctly', () => {
      const sortConfig: SortConfig = { key: 'projectsCount', direction: 'desc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchivedCustomers, comparator);

      expect(sorted[0].projectsCount).toBe(12);
      expect(sorted[1].projectsCount).toBe(5);
    });
  });

  describe('Archive Activity Logs Sorting', () => {
    const mockArchiveLogs = [
      {
        id: 1,
        action: 'ARCHIVE',
        entityType: 'PROJECT',
        entityName: 'Legacy Project',
        userEmail: 'admin@example.com',
        createdAt: '2023-01-15T10:30:00Z'
      },
      {
        id: 2,
        action: 'RESTORE',
        entityType: 'USER',
        entityName: 'John Doe',
        userEmail: 'manager@example.com',
        createdAt: '2023-01-14T16:45:00Z'
      }
    ];

    it('should sort by action correctly', () => {
      const sortConfig: SortConfig = { key: 'action', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchiveLogs, comparator);

      expect(sorted[0].action).toBe('ARCHIVE');
      expect(sorted[1].action).toBe('RESTORE');
    });

    it('should sort by entity type correctly', () => {
      const sortConfig: SortConfig = { key: 'entityType', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchiveLogs, comparator);

      expect(sorted[0].entityType).toBe('PROJECT');
      expect(sorted[1].entityType).toBe('USER');
    });

    it('should sort by timestamp correctly', () => {
      const sortConfig: SortConfig = { key: 'createdAt', direction: 'desc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mockArchiveLogs, comparator);

      expect(sorted[0].id).toBe(1); // 2023-01-15
      expect(sorted[1].id).toBe(2); // 2023-01-14
    });
  });

  describe('URL Parameter Integration', () => {
    it('should handle multiple sort parameters for different tables', () => {
      // Simulate different URL params for different tables
      const emailLogsConfig: SortConfig = { key: 'sentAt', direction: 'desc' };
      const auditLogsConfig: SortConfig = { key: 'userEmail', direction: 'asc' };
      const usersConfig: SortConfig = { key: 'firstName', direction: 'asc' };

      const emailComparator = makeComparator(emailLogsConfig);
      const auditComparator = makeComparator(auditLogsConfig);
      const usersComparator = makeComparator(usersConfig);

      // Each comparator should work independently
      expect(typeof emailComparator).toBe('function');
      expect(typeof auditComparator).toBe('function');
      expect(typeof usersComparator).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays', () => {
      const sortConfig: SortConfig = { key: 'name', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort([], comparator);

      expect(sorted).toEqual([]);
    });

    it('should handle single element arrays', () => {
      const data = [{ name: 'Alice' }];
      const sortConfig: SortConfig = { key: 'name', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(data, comparator);

      expect(sorted).toEqual(data);
      expect(sorted).not.toBe(data); // Should be a new array
    });

    it('should handle null sort config', () => {
      const data = [{ name: 'Bob' }, { name: 'Alice' }];
      const comparator = makeComparator(null);
      const sorted = stableSort(data, comparator);

      // Should maintain original order when no sort config
      expect(sorted[0].name).toBe('Bob');
      expect(sorted[1].name).toBe('Alice');
    });

    it('should handle mixed data types gracefully', () => {
      const mixedData = [
        { value: 'string' },
        { value: 42 },
        { value: null },
        { value: true },
        { value: new Date('2023-01-15') }
      ];

      const sortConfig: SortConfig = { key: 'value', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(mixedData, comparator);

      // Should not throw an error and return an array
      expect(Array.isArray(sorted)).toBe(true);
      expect(sorted.length).toBe(5);
    });

    it('should handle deeply nested field access safely', () => {
      const nestedData = [
        { user: { profile: { contact: { email: 'alice@example.com' } } } },
        { user: { profile: { contact: { email: 'bob@example.com' } } } },
        { user: { profile: null } }, // Missing nested property
        { user: null }, // Missing intermediate property
        {} // Missing root property
      ];

      const sortConfig: SortConfig = { key: 'user.profile.contact.email', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(nestedData, comparator);

      // Should not throw an error and sort valid emails first
      expect(Array.isArray(sorted)).toBe(true);
      expect(sorted.length).toBe(5);
      expect(sorted[0].user?.profile?.contact?.email).toBe('alice@example.com');
    });
  });

  describe('Performance and Memory', () => {
    it('should not mutate original data during sorting', () => {
      const originalData = [
        { name: 'Charlie', id: 3 },
        { name: 'Alice', id: 1 },
        { name: 'Bob', id: 2 }
      ];
      const originalDataCopy = JSON.parse(JSON.stringify(originalData));

      const sortConfig: SortConfig = { key: 'name', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      const sorted = stableSort(originalData, comparator);

      // Original data should be unchanged
      expect(originalData).toEqual(originalDataCopy);
      
      // Sorted data should be different
      expect(sorted[0].name).toBe('Alice');
      expect(originalData[0].name).toBe('Charlie');
    });

    it('should handle large datasets efficiently', () => {
      // Create a reasonably large dataset
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        value: Math.random(),
        date: new Date(2023, 0, i % 30 + 1).toISOString()
      }));

      const sortConfig: SortConfig = { key: 'value', direction: 'asc' };
      const comparator = makeComparator(sortConfig);
      
      const start = performance.now();
      const sorted = stableSort(largeData, comparator);
      const end = performance.now();

      // Should complete in reasonable time (less than 100ms for 1000 items)
      expect(end - start).toBeLessThan(100);
      expect(sorted.length).toBe(1000);
      
      // Verify it's actually sorted
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].value).toBeGreaterThanOrEqual(sorted[i - 1].value);
      }
    });
  });
});
