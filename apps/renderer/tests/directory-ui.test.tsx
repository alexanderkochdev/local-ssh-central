// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SftpBookmark } from '@ssh-central/ipc-contracts';
import { SftpStartDirectoryDialog } from '../src/features/sftp/SftpStartDirectoryDialog.js';
import { SftpBookmarksEditor } from '../src/features/hosts/SftpBookmarksEditor.js';

const t = (key: string) => key;

describe('SftpStartDirectoryDialog', () => {
  const options = [
    { key: 'home', label: 'sftp.startHome', path: '/home/user' },
    { key: 'last', label: 'sftp.startLast', path: '/var/www' },
    { key: 'bookmark:logs', label: 'Logs', description: 'App-Logs', path: '/var/log' },
  ];

  it('rendert alle Optionen inkl. Lesezeichen-Beschreibung', () => {
    render(<SftpStartDirectoryDialog open options={options} t={t} onSelect={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('/home/user')).toBeTruthy();
    expect(screen.getByText('/var/www')).toBeTruthy();
    expect(screen.getByText('Logs')).toBeTruthy();
    expect(screen.getByText(/App-Logs/)).toBeTruthy();
  });

  it('ruft onSelect mit dem Pfad der gewaehlten Option auf', () => {
    const onSelect = vi.fn();
    render(<SftpStartDirectoryDialog open options={options} t={t} onSelect={onSelect} onCancel={() => {}} />);
    fireEvent.click(screen.getByText('Logs'));
    expect(onSelect).toHaveBeenCalledWith('/var/log');
  });

  it('bietet keinen separaten "Home-Folder"-Button mehr an (Home ist oben die erste Option)', () => {
    const onCancel = vi.fn();
    render(<SftpStartDirectoryDialog open options={options} t={t} onSelect={() => {}} onCancel={onCancel} />);
    expect(screen.queryByText('sftp.startCancel')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('rendert nichts, wenn closed', () => {
    const { container } = render(
      <SftpStartDirectoryDialog open={false} options={options} t={t} onSelect={() => {}} onCancel={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('SftpBookmarksEditor', () => {
  const bookmarks: SftpBookmark[] = [
    { slug: 'logs', label: 'Logs', description: 'App-Logs', path: '/var/log' },
  ];

  beforeEach(() => {
    (window as unknown as Record<string, unknown>).api = {};
  });

  it('rendert bestehende Lesezeichen', () => {
    render(<SftpBookmarksEditor value={bookmarks} onChange={() => {}} t={t} />);
    expect(screen.getByText('Logs')).toBeTruthy();
    expect(screen.getByText(/\/var\/log/)).toBeTruthy();
  });

  it('loescht ein Lesezeichen', () => {
    const onChange = vi.fn();
    const { container } = render(<SftpBookmarksEditor value={bookmarks} onChange={onChange} t={t} />);
    const deleteButtons = container.querySelectorAll('[title="action.delete"]');
    fireEvent.click(deleteButtons[0]!);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('fuegt ein neues Lesezeichen hinzu', () => {
    const onChange = vi.fn();
    render(<SftpBookmarksEditor value={[]} onChange={onChange} t={t} />);
    fireEvent.click(screen.getByText('hosts.sftpBookmarkAdd'));

    // Unter-Dialog oeffnet. Felder befuellen.
    fireEvent.change(screen.getByLabelText(/hosts\.sftpBookmarkLabel/), { target: { value: 'Logs' } });
    fireEvent.change(screen.getByLabelText(/hosts\.sftpBookmarkPath/), { target: { value: '/var/log' } });
    fireEvent.click(screen.getByText('action.save'));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'Logs', path: '/var/log', slug: 'logs' }),
    ]);
  });

  it('zeigt einen Fehler bei fehlendem Pfad', () => {
    const onChange = vi.fn();
    render(<SftpBookmarksEditor value={[]} onChange={onChange} t={t} />);
    fireEvent.click(screen.getByText('hosts.sftpBookmarkAdd'));
    fireEvent.change(screen.getByLabelText(/hosts\.sftpBookmarkLabel/), { target: { value: 'nur label' } });
    fireEvent.click(screen.getByText('action.save'));
    expect(screen.getByText('hosts.sftpBookmarkMissing')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
