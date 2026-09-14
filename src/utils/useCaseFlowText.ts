export const numberedLinePattern = /^(\s*)(\d+(?:\.\d+)*)\.\s?(.*)$/;

export const bulletLinePattern = /^(\s*)-\s?(.*)$/;

export const stepIndent = '    ';

const hierarchicalBulletSymbols = ['•', '◦', '▪'] as const;

const hierarchicalBulletPattern = /^(\s*)([•◦▪])\s?(.*)$/;

const bulletShortcutPattern = /^(\s*)[-*•◦▪]\s?(.*)$/;

export const getLineInfo = (value: string, position: number) => {
  const lines = value.split('\n');
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineLength = lines[lineIndex].length;
    const lineEnd = offset + lineLength;

    if (position <= lineEnd || lineIndex === lines.length - 1) {
      return {
        lineIndex,
        lineStart: offset,
        lineColumn: Math.max(0, position - offset),
        lines,
      };
    }

    offset = lineEnd + 1;
  }

  return {
    lineIndex: 0,
    lineStart: 0,
    lineColumn: 0,
    lines,
  };
};

const incrementNumber = (value: string): string => {
  const parts = value.split('.').map(Number);
  parts[parts.length - 1] = (parts[parts.length - 1] ?? 0) + 1;
  return parts.join('.');
};

const createChildNumber = (value: string): string => `${value}.1`;

const getStepLevel = (value: string): number => value.split('.').length;

const getIndentForLevel = (level: number): string => stepIndent.repeat(Math.max(0, level - 1));

const formatNumberedLine = (number: string, text = ''): string =>
  `${getIndentForLevel(getStepLevel(number))}${number}. ${text}`;

export const getMarkerLength = (line: string): number => {
  const numberedMatch = numberedLinePattern.exec(line);

  if (numberedMatch !== null) {
    return `${numberedMatch[1]}${numberedMatch[2]}. `.length;
  }

  const bulletMatch = bulletLinePattern.exec(line);
  return bulletMatch === null ? 0 : `${bulletMatch[1]}- `.length;
};

const getHierarchicalBulletSymbol = (level: number): string =>
  hierarchicalBulletSymbols[Math.min(level, hierarchicalBulletSymbols.length - 1)];

const getIndentLevel = (indentation: string): number => Math.max(0, Math.floor(indentation.length / stepIndent.length));

const formatHierarchicalBulletLine = (level: number, text = ''): string =>
  `${stepIndent.repeat(Math.max(0, level))}${getHierarchicalBulletSymbol(level)} ${text}`;

const getHierarchicalBulletMarkerLength = (line: string): number => {
  const match = hierarchicalBulletPattern.exec(line);
  return match === null ? 0 : `${match[1]}${match[2]} `.length;
};

export const normalizeStateBulletShortcut = (
  value: string,
  position: number,
): { lineIndex: number; markerLength: number; value: string } | null => {
  const { lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const shortcutMatch = bulletShortcutPattern.exec(currentLine);

  if (shortcutMatch === null) {
    return null;
  }

  const level = getIndentLevel(shortcutMatch[1]);
  lines[lineIndex] = formatHierarchicalBulletLine(level, shortcutMatch[2]);
  const nextValue = lines.join('\n');
  return {
    lineIndex,
    markerLength: getHierarchicalBulletMarkerLength(nextValue.split('\n')[lineIndex] ?? ''),
    value: nextValue,
  };
};

export const insertStateBulletLine = (
  value: string,
  position: number,
): { lineIndex: number; markerLength: number; value: string } => {
  const { lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const bulletMatch = hierarchicalBulletPattern.exec(currentLine);

  if (bulletMatch !== null) {
    const level = getIndentLevel(bulletMatch[1]);

    if (bulletMatch[3].trim().length === 0) {
      lines.splice(lineIndex, 1, '');
      const nextValue = lines.join('\n');
      return { lineIndex, markerLength: 0, value: nextValue };
    }

    const nextLine = formatHierarchicalBulletLine(level);
    lines.splice(lineIndex + 1, 0, nextLine);
    const nextValue = lines.join('\n');
    return {
      lineIndex: lineIndex + 1,
      markerLength: getHierarchicalBulletMarkerLength(nextLine),
      value: nextValue,
    };
  }

  const currentText = currentLine.trim();

  if (currentText.length === 0) {
    lines[lineIndex] = formatHierarchicalBulletLine(0);
    const nextValue = lines.join('\n');
    return {
      lineIndex,
      markerLength: getHierarchicalBulletMarkerLength(lines[lineIndex] ?? ''),
      value: nextValue,
    };
  }

  lines.splice(lineIndex + 1, 0, formatHierarchicalBulletLine(0));
  const nextValue = lines.join('\n');
  return {
    lineIndex: lineIndex + 1,
    markerLength: getHierarchicalBulletMarkerLength(lines[lineIndex + 1] ?? ''),
    value: nextValue,
  };
};

export const changeStateBulletLevel = (
  value: string,
  position: number,
  direction: 1 | -1,
): { lineIndex: number; markerLength: number; value: string } | null => {
  const { lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const bulletMatch = hierarchicalBulletPattern.exec(currentLine);

  if (bulletMatch === null) {
    return null;
  }

  const currentLevel = getIndentLevel(bulletMatch[1]);
  const nextLevel = Math.max(0, currentLevel + direction);
  lines[lineIndex] = formatHierarchicalBulletLine(nextLevel, bulletMatch[3]);
  const nextValue = lines.join('\n');

  return {
    lineIndex,
    markerLength: getHierarchicalBulletMarkerLength(lines[lineIndex] ?? ''),
    value: nextValue,
  };
};

export const removeOrPromoteStateBullet = (
  value: string,
  position: number,
): { lineIndex: number; markerLength: number; value: string } | null => {
  const { lineColumn, lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const bulletMatch = hierarchicalBulletPattern.exec(currentLine);

  if (bulletMatch === null) {
    return null;
  }

  const markerLength = getHierarchicalBulletMarkerLength(currentLine);

  if (lineColumn > markerLength) {
    return null;
  }

  const currentLevel = getIndentLevel(bulletMatch[1]);

  if (currentLevel > 0) {
    lines[lineIndex] = formatHierarchicalBulletLine(currentLevel - 1, bulletMatch[3]);
    const nextValue = lines.join('\n');
    return {
      lineIndex,
      markerLength: getHierarchicalBulletMarkerLength(lines[lineIndex] ?? ''),
      value: nextValue,
    };
  }

  lines[lineIndex] = bulletMatch[3];
  const nextValue = lines.join('\n');
  return { lineIndex, markerLength: 0, value: nextValue };
};

export const insertLineAfterCurrent = (
  value: string,
  position: number,
  childStep = false,
): { lineIndex: number; markerLength: number; value: string } => {
  const { lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const bulletMatch = bulletLinePattern.exec(currentLine);
  const numberedMatch = numberedLinePattern.exec(currentLine);
  let nextLine = '1. ';

  if (bulletMatch !== null) {
    if (bulletMatch[2].trim().length === 0) {
      const previousNumberedLine = lines
        .slice(0, lineIndex)
        .reverse()
        .find((line) => numberedLinePattern.test(line));
      const previousMatch = previousNumberedLine === undefined ? null : numberedLinePattern.exec(previousNumberedLine);
      const nextNumber = previousMatch === null ? '1' : incrementNumber(previousMatch[2]);
      lines[lineIndex] = formatNumberedLine(nextNumber);
      const nextValue = lines.join('\n');
      return { lineIndex, markerLength: getMarkerLength(nextValue.split('\n')[lineIndex] ?? ''), value: nextValue };
    }

    nextLine = `${bulletMatch[1]}- `;
  } else if (numberedMatch !== null) {
    if (numberedMatch[3].trim().length === 0) {
      lines[lineIndex] = `${numberedMatch[1]}${stepIndent}- `;
      const nextValue = lines.join('\n');
      return { lineIndex, markerLength: getMarkerLength(nextValue.split('\n')[lineIndex] ?? ''), value: nextValue };
    }

    if (!childStep && numberedMatch[3].trimEnd().endsWith(':')) {
      nextLine = `${numberedMatch[1]}${stepIndent}- `;
    } else {
      const nextNumber = childStep ? createChildNumber(numberedMatch[2]) : incrementNumber(numberedMatch[2]);
      nextLine = formatNumberedLine(nextNumber);
    }
  }

  lines.splice(lineIndex + 1, 0, nextLine);
  const nextValue = lines.join('\n');
  const nextLineText = nextValue.split('\n')[lineIndex + 1] ?? nextLine;
  return { lineIndex: lineIndex + 1, markerLength: getMarkerLength(nextLineText), value: nextValue };
};

export const changeLineLevel = (
  value: string,
  position: number,
  direction: 1 | -1,
): { lineIndex: number; markerLength: number; value: string } => {
  const { lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const match = numberedLinePattern.exec(currentLine);

  if (match === null) {
    return { lineIndex, markerLength: 0, value };
  }

  const text = match[3];
  const parts = match[2].split('.');
  const nextNumber =
    direction === 1
      ? createChildNumber(match[2])
      : parts.length > 1
        ? incrementNumber(parts.slice(0, -1).join('.'))
        : match[2];
  lines[lineIndex] = formatNumberedLine(nextNumber, text);

  const nextValue = lines.join('\n');
  const nextLineText = nextValue.split('\n')[lineIndex] ?? '';
  return { lineIndex, markerLength: getMarkerLength(nextLineText), value: nextValue };
};

export const insertFlowBulletLine = (
  value: string,
  position: number,
): { lineIndex: number; markerLength: number; value: string } => {
  const { lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const numberedMatch = numberedLinePattern.exec(currentLine);
  const bulletMatch = bulletLinePattern.exec(currentLine);
  const indentation = bulletMatch?.[1] ?? numberedMatch?.[1] ?? /^(\s*)/.exec(currentLine)?.[1] ?? '';
  const nextLine = `${indentation}${stepIndent}- `;

  lines.splice(lineIndex + 1, 0, nextLine);
  const nextValue = lines.join('\n');
  return {
    lineIndex: lineIndex + 1,
    markerLength: getMarkerLength(nextLine),
    value: nextValue,
  };
};

export const removeOrPromoteFlowMarker = (
  value: string,
  position: number,
): { lineIndex: number; markerLength: number; value: string } | null => {
  const { lineColumn, lineIndex, lines } = getLineInfo(value, position);
  const currentLine = lines[lineIndex] ?? '';
  const numberedMatch = numberedLinePattern.exec(currentLine);
  const bulletMatch = bulletLinePattern.exec(currentLine);

  if (bulletMatch !== null) {
    const markerLength = getMarkerLength(currentLine);

    if (lineColumn > markerLength) {
      return null;
    }

    const currentLevel = getIndentLevel(bulletMatch[1]);

    if (currentLevel > 0) {
      lines[lineIndex] = `${stepIndent.repeat(currentLevel - 1)}- ${bulletMatch[2]}`;
      const nextValue = lines.join('\n');
      return {
        lineIndex,
        markerLength: getMarkerLength(lines[lineIndex] ?? ''),
        value: nextValue,
      };
    }

    lines[lineIndex] = bulletMatch[2];
    const nextValue = lines.join('\n');
    return { lineIndex, markerLength: 0, value: nextValue };
  }

  if (numberedMatch !== null) {
    const markerLength = getMarkerLength(currentLine);

    if (lineColumn > markerLength || numberedMatch[2].split('.').length <= 1) {
      return null;
    }

    const result = changeLineLevel(value, position, -1);
    return result;
  }

  return null;
};

export const ensureStepMarker = (value: string): string => {
  if (value.trim().length === 0) {
    return '1. ';
  }

  return value;
};
