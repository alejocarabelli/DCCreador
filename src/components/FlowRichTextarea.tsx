import { memo, useMemo, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import {
  getBulletDepths,
  isStateScenarioHeading,
  parseFlowText,
  tokenizeFlowInline,
  type FlowInlineToken,
  type FlowVocabulary,
} from '../utils/flowDocument';
import { AutoGrowTextarea } from './AutoGrowTextarea';

type FlowRichTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
  minRows?: number;
  value: string;
  /** `flow`: numbered steps and `-` bullets. `state`: •◦▪ bullets and «Si …» scenarios. */
  variant: 'flow' | 'state';
  vocabulary: FlowVocabulary;
};

const tokenClass: Record<FlowInlineToken['kind'], string | undefined> = {
  plain: undefined,
  class: 'rt-class',
  attribute: 'rt-attribute',
  keyword: 'rt-keyword',
  stepRef: 'rt-step-ref',
  pathRef: 'rt-path-ref',
  literal: 'rt-literal',
};

const renderTokens = (tokens: FlowInlineToken[], keyPrefix: string): ReactNode[] =>
  tokens.map((token, index) => {
    const className = tokenClass[token.kind];
    return className === undefined
      ? token.text
      : <span className={className} key={`${keyPrefix}:${index}`}>{token.text}</span>;
  });

const renderFlowLines = (value: string, vocabulary: FlowVocabulary): ReactNode[] => {
  const lines = parseFlowText(value);
  const bulletDepths = getBulletDepths(lines);

  return lines.map((line, index) => {
    const key = `l${index}`;
    const body = renderTokens(tokenizeFlowInline(line.body, vocabulary), key);
    const suffix = line.refSuffix.length > 0 ? <span className="rt-path-ref">{line.refSuffix}</span> : null;
    let content: ReactNode;

    if (line.kind === 'step') {
      const indentation = line.marker.slice(0, line.indent);
      const marker = line.marker.slice(line.indent);
      content = (
        <span className={line.level === 1 ? 'rt-main' : undefined}>
          {indentation}
          <span className="rt-number">{marker}</span>
          {body}
          {suffix}
        </span>
      );
    } else if (line.kind === 'bullet') {
      const indentation = line.marker.slice(0, line.indent);
      const dash = line.marker.slice(line.indent, line.indent + 1);
      const afterDash = line.marker.slice(line.indent + 1);
      content = (
        <>
          {indentation}
          <span className="rt-bullet" data-depth={Math.min(2, bulletDepths[index])}>{dash}</span>
          {afterDash}
          {body}
          {suffix}
        </>
      );
    } else {
      content = <>{line.marker}{body}{suffix}</>;
    }

    return <span key={key}>{content}{index < lines.length - 1 ? '\n' : null}</span>;
  });
};

const stateLinePattern = /^(\s*)([•◦▪-]\s?)?(.*)$/;

const renderStateLines = (value: string, vocabulary: FlowVocabulary): ReactNode[] => {
  const lines = value.split('\n');

  return lines.map((raw, index) => {
    const key = `l${index}`;
    const match = stateLinePattern.exec(raw);
    const lead = `${match?.[1] ?? ''}${match?.[2] ?? ''}`;
    const body = renderTokens(tokenizeFlowInline(match?.[3] ?? raw, vocabulary, false), key);

    return (
      <span className={isStateScenarioHeading(raw) ? 'rt-main' : undefined} key={key}>
        {lead.length > 0 ? <span className="rt-number">{lead}</span> : null}
        {body}
        {index < lines.length - 1 ? '\n' : null}
      </span>
    );
  });
};

/**
 * A textarea drawn over a formatted copy of its own text. The textarea keeps
 * every native behaviour (caret, selection, undo, spelling, IME); the copy
 * behind it shows main steps, classes, attributes and references formatted.
 * Nothing it draws changes a glyph's width, so the caret always lands on the
 * character under it: main steps are thickened with a stroke rather than set
 * in a bold face, and italics use the regular widths of the system font.
 */
export const FlowRichTextarea = memo(function FlowRichTextarea({
  className,
  variant,
  vocabulary,
  value,
  ref,
  ...props
}: FlowRichTextareaProps) {
  const mirror = useMemo(
    () => (variant === 'flow' ? renderFlowLines(value, vocabulary) : renderStateLines(value, vocabulary)),
    [value, variant, vocabulary],
  );

  return (
    <div className={`rich-text rich-text-${variant}`}>
      <div aria-hidden="true" className={`${className ?? ''} rich-text-mirror`}>
        {mirror}
        {/* A trailing newline only takes up a line when something follows it. */}
        {value.length === 0 || value.endsWith('\n') ? '​' : null}
      </div>
      <AutoGrowTextarea {...props} inputRef={(element) => {
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }} className={`${className ?? ''} rich-text-input`} spellCheck={false} value={value} />
    </div>
  );
});
