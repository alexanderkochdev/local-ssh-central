import { describe, it, expect } from 'vitest';
import { parentPath, joinPath, parentLocalPath } from '../src/features/sftp/FilePane.js';

describe('parentPath (remote, forward-slash)', () => {
  it('behandelt die Wurzel', () => {
    expect(parentPath('/')).toBe('/');
    expect(parentPath('')).toBe('');
  });

  it('liefert den Eltern-Pfad', () => {
    expect(parentPath('/home/user')).toBe('/home');
    expect(parentPath('/a/b/c')).toBe('/a/b');
    expect(parentPath('/home')).toBe('/');
  });

  it('ignoriert trailing Slashes', () => {
    expect(parentPath('/home/user/')).toBe('/home');
  });
});

describe('joinPath', () => {
  it('joint Segmente forward-slash', () => {
    expect(joinPath('/', 'file.txt')).toBe('/file.txt');
    expect(joinPath('/home', 'file.txt')).toBe('/home/file.txt');
    expect(joinPath('/home/', 'file.txt')).toBe('/home/file.txt');
  });
});

describe('parentLocalPath (Windows, lokale Laufwerke)', () => {
  it('behandelt leeren Pfad', () => {
    expect(parentLocalPath('')).toBe('');
  });

  it('Laufwerk-Root fuehrt zurueck zur Laufwerks-Auswahl', () => {
    expect(parentLocalPath('C:\\')).toBe('');
    expect(parentLocalPath('D:/')).toBe('');
  });

  it('liefert den Eltern-Pfad inkl. Laufwerk-Suffix', () => {
    expect(parentLocalPath('C:\\Users')).toBe('C:\\');
    expect(parentLocalPath('C:\\Users\\alex')).toBe('C:\\Users');
  });
});
