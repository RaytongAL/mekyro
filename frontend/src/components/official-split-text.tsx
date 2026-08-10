import type { CSSProperties, ElementType, ReactNode } from "react";

type OfficialTextComponent = ElementType<{
  "aria-label"?: string;
  children?: ReactNode;
  className?: string;
}>;

type OfficialSplitTextProps = {
  as?: OfficialTextComponent;
  className?: string;
  delayStepMs?: number;
  splitBy?: "character" | "word";
  text: string;
};

function SplitCharacter({ character, delayMs }: { character: string; delayMs: number }) {
  return (
    <span
      aria-hidden="true"
      className="official-split-text-char"
      style={{ "--split-delay": `${delayMs}ms` } as CSSProperties}
    >
      {character === " " ? "\u00a0" : character}
    </span>
  );
}

export function OfficialSplitText({
  as: Component = "span",
  className = "",
  delayStepMs = 34,
  splitBy = "character",
  text,
}: OfficialSplitTextProps) {
  const classNames = `official-split-text${className ? ` ${className}` : ""}`;

  if (splitBy === "word") {
    const tokens = text.match(/\S+|\s+/g) ?? [];
    let characterIndex = 0;

    return (
      <Component className={classNames} aria-label={text}>
        {tokens.map((token, tokenIndex) => {
          const characters = Array.from(token);

          if (/^\s+$/.test(token)) {
            characterIndex += characters.length;

            return (
              <span aria-hidden="true" className="official-split-text-space" key={`space-${tokenIndex}`}>
                {token}
              </span>
            );
          }

          return (
            <span aria-hidden="true" className="official-split-text-word" key={`${token}-${tokenIndex}`}>
              {characters.map(character => {
                const delayMs = characterIndex * delayStepMs;
                characterIndex += 1;

                return <SplitCharacter character={character} delayMs={delayMs} key={`${character}-${characterIndex}`} />;
              })}
            </span>
          );
        })}
      </Component>
    );
  }

  const characters = Array.from(text);

  return (
    <Component className={classNames} aria-label={text}>
      {characters.map((character, index) => (
        <SplitCharacter character={character} delayMs={index * delayStepMs} key={`${character}-${index}`} />
      ))}
    </Component>
  );
}
