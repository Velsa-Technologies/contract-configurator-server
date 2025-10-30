// Paragraph.jsx
import React, { useState, useEffect, useMemo } from "react";
import { RENDERING_MODE } from "../../constants/contractConstants";
import { jsonHandler } from "../../utils";
import { optionObserver, optionCreator } from "../../option";
import InlineOptionSpan from "./InlineOptionSpan.jsx";
import { renderHandler } from "../../rendering";
import { paragraphObserver } from "../../paragraphObserver.js";
import { useContract } from "../../context/ContractContext";
import { Content } from "./Content.jsx";
import { Children } from "./Children.jsx";

// Constants
const INITIAL_RENDER_STATUS = {
  ParagraphMode: RENDERING_MODE.PLAIN,
  DefaultMode: RENDERING_MODE.PLAIN,
  ContentMode: RENDERING_MODE.PLAIN,
  focused: false,
  isDefaultVisible: true,
};

const INLINE_STYLES = {
  inlineContainer: { display: "inline", margin: 0, padding: 0, width: "100%" },
  nonEditable: { userSelect: "none", display: "inline" },
  closingBracket: {
    userSelect: "none",
    display: "inline",
    background: "#11d925",
  },
  flexContainer: { display: "flex", alignItems: "flex-start" },
  numberingContainer: { display: "inline-block" },
  headline: { fontSize: "1.1em", fontWeight: "bold", margin: 0 },
};

// Custom hooks
const useOptionObserver = (subtree, isPreviewOnly, setRenderStatus) => {
  useEffect(() => {
    if (isPreviewOnly) return;

    const id = jsonHandler.readOptionFromJson(subtree)[0];
    if (!id) return;

    const optioninfo = jsonHandler.JsonToOption(subtree.optioninfo);
    const updateObject = {
      updateFunction: setRenderStatus,
      optionInfo: optioninfo,
    };

    optionObserver.unregister(id, updateObject);
    optionObserver.register(id, updateObject);

    return () => optionObserver.unregister(id, updateObject);
  }, [subtree, isPreviewOnly, setRenderStatus]);
};

const useParagraphObserver = (elementId, numberingString, isPreviewOnly) => {
  useEffect(() => {
    if (elementId && !isPreviewOnly) {
      paragraphObserver.broadcast(elementId, numberingString);
    }
  }, [elementId, numberingString, isPreviewOnly]);
};

// Utility functions
const parseInlineOption = (workingContent) => {
  const prefixRegex = /\[Optional\([^\]]+\):[^\]]*:\]\s*\[/g;
  const prefixMatch = prefixRegex.exec(workingContent);
  if (!prefixMatch) return null;

  const prefixStart = prefixMatch.index;
  const prefixEnd = prefixRegex.lastIndex;
  const afterPrefix = workingContent.slice(prefixEnd);

  let bracketCount = 1;
  let closingIndex = -1;
  for (let i = 0; i < afterPrefix.length; i++) {
    if (afterPrefix[i] === "[") bracketCount++;
    else if (afterPrefix[i] === "]") {
      bracketCount--;
      if (bracketCount === 0) {
        closingIndex = i;
        break;
      }
    }
  }

  if (closingIndex === -1) return null;

  const inside = afterPrefix.slice(0, closingIndex);
  const after = afterPrefix.slice(closingIndex + 1);
  const spaceBefore = inside.match(/(\s+)$/);
  const insideContent = spaceBefore
    ? inside.slice(0, -spaceBefore[1].length)
    : inside;
  const spaceBeforeBracket = spaceBefore ? spaceBefore[1] : "";

  return {
    beforeContent: workingContent.slice(0, prefixStart),
    insideContent,
    afterContent: after,
    spaceBeforeBracket,
    prefixEnd,
  };
};

const parseOptionInfo = (workingContent) => {
  // For optioninfo, we look for the pattern: content followed by space and closing bracket ` ]`
  const bracketIdx = workingContent.indexOf(" ]");
  if (bracketIdx !== -1) {
    // Found closing bracket pattern
    const beforeContent = workingContent.slice(0, bracketIdx);
    const spaceBeforeBracket = " ";
    const afterBracketIdx = bracketIdx + 2; // skip ' ]'
    const afterContent = workingContent.slice(afterBracketIdx);

    return {
      beforeContent: "",
      insideContent: beforeContent,
      afterContent: afterContent,
      spaceBeforeBracket: spaceBeforeBracket,
      prefixEnd: 0,
      hasClosingBracket: true,
    };
  } else {
    // No closing bracket found - treat entire content as inside content
    return {
      beforeContent: "",
      insideContent: workingContent,
      afterContent: "",
      spaceBeforeBracket: "",
      prefixEnd: 0,
      hasClosingBracket: false,
    };
  }
};

const formatTextArray = (textArray) =>
  textArray
    ?.map(
      (item) =>
        item?.getAsHtmlString?.() ||
        (typeof item === "string" ? item : String(item))
    )
    .join("") || "";

// Component factories
const createContentComponent = (
  key,
  contentId,
  rawContent,
  props,
  preserveBracketFormats = false,
  forceRemountKey = null
) => (
  <Content
    key={forceRemountKey ? `${key}-${forceRemountKey}` : key}
    contentId={contentId}
    rawContent={rawContent}
    contentRenderStatus={props.renderStatus}
    inlineOptions={[]}
    parentRenderStatus={props.parentRenderStatus}
    paragraphOption={props.paragraphOption}
    isPreviewOnly={props.isPreviewOnly}
    scheduleNum={props.scheduleNum}
    preserveBracketFormats={preserveBracketFormats}
  />
);

const createNonEditableSpan = (key, content, extraStyle = {}) => (
  <span
    key={key}
    contentEditable={false}
    suppressContentEditableWarning
    style={{ ...INLINE_STYLES.nonEditable, ...extraStyle }}
    dangerouslySetInnerHTML={{ __html: content }}
  />
);

const createTextSpan = (key, text) => (
  <span
    key={key}
    contentEditable={false}
    suppressContentEditableWarning
    style={INLINE_STYLES.nonEditable}
  >
    {text}
  </span>
);

// Main component
export function Paragraph({
  subtree,
  parentInfo,
  listInfo,
  index,
  isPreviewOnly = false,
  scheduleNum = null,
  suppressOptionBracket = false,
  parentOptionIdShown = false,
}) {
  const { state } = useContract();
  const [renderStatus, setRenderStatus] = useState(INITIAL_RENDER_STATUS);

  // Derived values
  let id = jsonHandler.readOptionFromJson(subtree)[0];
  const optionObject = jsonHandler.JsonToObject(subtree);
  const inlineOptions = optionObject.hasInlineOption
    ? optionObject.inlineoptions
    : [];

  // If no id from optioninfo, try to get it from first inline option
  if (!id && inlineOptions.length > 0) {
    id = inlineOptions[0]?.id;
  }

  // Register all inline options with optionCreator to ensure focus tracking
  useEffect(() => {
    if (inlineOptions && inlineOptions.length > 0) {
      inlineOptions.forEach((opt) => {
        optionCreator.handleOptionEntry(opt);
      });
    }
  }, [inlineOptions]);

  const optionInfo = optionObject.option;
  const hasChildren = jsonHandler.checkForChildren(subtree);
  const numberingString = parentInfo.numberingString
    ? `${parentInfo.numberingString}.${index + 1}`
    : `${index + 1}`;

  // Make optionState available everywhere in the component
  const optionState = optionInfo
    ? state.options_state?.[optionInfo.id]
    : undefined;

  // Custom hooks
  useOptionObserver(subtree, isPreviewOnly, setRenderStatus);
  useParagraphObserver(subtree.element_id, numberingString, isPreviewOnly);

  // Only memoize complex parent info calculation since it's passed to children
  const newParentInfo = useMemo(() => {
    const shouldChildPlaceFooter =
      renderStatus.isDefaultVisible && id && hasChildren && !isPreviewOnly;

    return {
      footerRenderStatus: {
        content:
          shouldChildPlaceFooter &&
          !parentInfo.footerRenderStatus.shouldChildPlaceFooter
            ? optionObserver.getDefaultEndText(id, optionInfo)
            : parentInfo.footerRenderStatus.content,
        shouldChildPlaceFooter,
        mode: parentInfo.footerRenderStatus.shouldChildPlaceFooter
          ? parentInfo.footerRenderStatus.mode
          : renderStatus.DefaultMode,
      },
      lastCriticalRenderStatus: {
        mode: renderHandler.updateParent(
          parentInfo.lastCriticalRenderStatus.mode,
          renderStatus.ParagraphMode
        ),
        focused:
          parentInfo.lastCriticalRenderStatus.focused || renderStatus.focused,
      },
      numberingString,
      level: parentInfo.level + 1,
    };
  }, [
    renderStatus,
    id,
    optionInfo,
    hasChildren,
    isPreviewOnly,
    parentInfo,
    numberingString,
  ]);

  // Calculate default texts
  const needsDefaultText =
    ((renderStatus.isDefaultVisible && id) ||
      parentInfo.footerRenderStatus.shouldChildPlaceFooter) &&
    !hasChildren &&
    !isPreviewOnly;
  const defaultBeginText =
    renderStatus.isDefaultVisible && id && !isPreviewOnly && listInfo?.isFirst
      ? optionObserver.getDefaultBeginText(id, optionInfo)
      : [];
  const defaultEndText = needsDefaultText
    ? parentInfo.footerRenderStatus.shouldChildPlaceFooter
      ? parentInfo.footerRenderStatus.content
      : optionObserver.getDefaultEndText(id, optionInfo)
    : [];

  // Restore legacy rendering, but wrap insideContent with InlineOptionSpan for focus
  const processInlineOptions = (rawContent) => {
    const renderedContent = [];
    let workingContent = rawContent;

    const commonProps = {
      renderStatus,
      parentRenderStatus: parentInfo.lastCriticalRenderStatus,
      paragraphOption: id,
      isPreviewOnly,
      scheduleNum,
    };

    inlineOptions.forEach((option, idx) => {
      const optionState = state.options_state[option.id];
      const parsed = parseInlineOption(workingContent);
      if (!parsed) return;

      const { beforeContent, insideContent, afterContent, spaceBeforeBracket } =
        parsed;

      // Add before content
      if (beforeContent) {
        renderedContent.push(
          createContentComponent(
            `before-${idx}`,
            `${subtree.element_id}-before-${idx}`,
            beforeContent,
            commonProps,
            true,
            subtree.resetVersion || 0
          )
        );
      }

      if (optionState === "hidden") {
        // Only add after content for hidden options
        if (afterContent) {
          renderedContent.push(
            createContentComponent(
              `after-${idx}`,
              `${subtree.element_id}-after-${idx}`,
              afterContent,
              commonProps,
              true,
              subtree.resetVersion || 0
            )
          );
        }
      } else if (optionState && optionState !== "default") {
        // For any non-default state, render inside content without brackets
        if (insideContent) {
          renderedContent.push(
            <InlineOptionSpan key={`inline-${idx}`} optionId={option.id}>
              {createContentComponent(
                `inside-${idx}`,
                `${subtree.element_id}-inline-${idx}`,
                insideContent,
                commonProps,
                true,
                subtree.resetVersion || 0
              )}
            </InlineOptionSpan>
          );
        }
        if (afterContent) {
          renderedContent.push(
            createContentComponent(
              `after-${idx}`,
              `${subtree.element_id}-after-${idx}`,
              afterContent,
              commonProps,
              true,
              subtree.resetVersion || 0
            )
          );
        }
      } else {
        // Default state: render prefix, inside, and closing bracket
        if (!isPreviewOnly) {
          const prefixText = formatTextArray(
            optionObserver.getDefaultBeginText(option.id, option)
          );
          if (prefixText) {
            renderedContent.push(
              createNonEditableSpan(`prefix-${idx}`, prefixText)
            );
          }
        }
        if (insideContent) {
          renderedContent.push(
            <InlineOptionSpan key={`inline-${idx}`} optionId={option.id}>
              {createContentComponent(
                `inside-${idx}`,
                `${subtree.element_id}-inline-${idx}`,
                insideContent,
                commonProps,
                true,
                subtree.resetVersion || 0
              )}
            </InlineOptionSpan>
          );
        }
        // Only show closing bracket in edit mode (not in preview) and if parent option is not active
        if (!isPreviewOnly && !parentOptionIdShown) {
          if (spaceBeforeBracket) {
            renderedContent.push(
              createTextSpan(`space-${idx}`, spaceBeforeBracket)
            );
          }
          renderedContent.push(
            createNonEditableSpan(
              `bracket-${idx}`,
              "]",
              INLINE_STYLES.closingBracket
            )
          );
        }
        if (afterContent) {
          renderedContent.push(
            createContentComponent(
              `after-${idx}`,
              `${subtree.element_id}-after-${idx}`,
              afterContent,
              commonProps,
              true,
              subtree.resetVersion || 0
            )
          );
        }
      }
      workingContent = "";
    });
    return renderedContent;
  };

  // Process option info using the same logic, but without adding prefix text
  const processOptionInfo = (rawContent, optionInfoObj) => {
    if (!optionInfoObj || !optionInfoObj.id) return [];

    const renderedContent = [];
    const optionState = state.options_state[optionInfoObj.id];
    const parsed = parseOptionInfo(rawContent);

    if (!parsed) return [];

    const {
      beforeContent,
      insideContent,
      afterContent,
      spaceBeforeBracket,
      hasClosingBracket,
    } = parsed;

    const commonProps = {
      renderStatus,
      parentRenderStatus: parentInfo.lastCriticalRenderStatus,
      paragraphOption: id,
      isPreviewOnly,
      scheduleNum,
    };

    if (beforeContent) {
      renderedContent.push(
        createContentComponent(
          `before-0`,
          `${subtree.element_id}-before-0`,
          beforeContent,
          commonProps,
          true
        )
      );
    }

    if (optionState === "hidden") {
      if (afterContent) {
        renderedContent.push(
          createContentComponent(
            `after-0`,
            `${subtree.element_id}-after-0`,
            afterContent,
            commonProps,
            true
          )
        );
      }
    } else if (optionState && optionState !== "default") {
      if (insideContent) {
        renderedContent.push(
          createContentComponent(
            `inside-0`,
            `${subtree.element_id}-inline-0`,
            insideContent,
            commonProps,
            true
          )
        );
      }
      if (afterContent) {
        renderedContent.push(
          createContentComponent(
            `after-0`,
            `${subtree.element_id}-after-0`,
            afterContent,
            commonProps,
            true
          )
        );
      }
    } else {
      if (insideContent) {
        renderedContent.push(
          createContentComponent(
            `inside-0`,
            `${subtree.element_id}-inline-0`,
            insideContent,
            commonProps,
            true
          )
        );
      }

      // Only show closing bracket if parent option is not active
      if (hasClosingBracket && !parentOptionIdShown) {
        if (spaceBeforeBracket) {
          renderedContent.push(createTextSpan(`space-0`, spaceBeforeBracket));
        }

        renderedContent.push(
          createNonEditableSpan(`bracket-0`, "]", INLINE_STYLES.closingBracket)
        );
      }

      if (afterContent) {
        renderedContent.push(
          createContentComponent(
            `after-0`,
            `${subtree.element_id}-after-0`,
            afterContent,
            commonProps,
            true
          )
        );
      }
    }

    return renderedContent;
  };

  // Process normal paragraphs for closing brackets with spaces
  const processNormalParagraph = (rawContent) => {
    const commonProps = {
      renderStatus,
      parentRenderStatus: parentInfo.lastCriticalRenderStatus,
      paragraphOption: id,
      isPreviewOnly,
      scheduleNum,
    };

    // Use resetVersion to prevent cursor loss during editing
    const forceRemountKey = subtree.resetVersion || 0;

    // Simple approach: always return a single Content component
    // If there's a bracket and parent is not shown, we'll handle it in useContentRenderer
    return [
      <Content
        key={`content-${forceRemountKey}`}
        contentId={subtree.element_id}
        rawContent={rawContent}
        contentRenderStatus={commonProps.renderStatus}
        inlineOptions={[]}
        parentRenderStatus={commonProps.parentRenderStatus}
        paragraphOption={commonProps.paragraphOption}
        isPreviewOnly={commonProps.isPreviewOnly}
        scheduleNum={commonProps.scheduleNum}
        preserveBracketFormats={true}
        parentOptionIdShown={parentOptionIdShown}
      />,
    ];
  };

  // Memoization keys
  const inlineOptionsStateKey =
    inlineOptions.length === 0
      ? ""
      : inlineOptions
          .map((opt) => `${opt.id}:${state.options_state[opt.id] || "default"}`)
          .join("|");

  const optionInfoStateKey =
    optionInfo && optionInfo.id
      ? `${optionInfo.id}:${state.options_state[optionInfo.id] || "default"}`
      : "";

  const ContentComponent = useMemo(() => {
    const rawContent = subtree.text ?? subtree.content ?? "";

    // Handle case with option info
    if (inlineOptions.length === 0 && optionInfo && optionInfo.id) {
      const processedContent = processOptionInfo(rawContent, optionInfo);

      if (processedContent.length > 0) {
        return (
          <p style={INLINE_STYLES.inlineContainer}>
            {defaultBeginText.length > 0 &&
              createNonEditableSpan(
                "default-begin",
                formatTextArray(defaultBeginText)
              )}
            {processedContent}
          </p>
        );
      }

      return (
        <p style={INLINE_STYLES.inlineContainer}>
          {defaultBeginText.length > 0 &&
            createNonEditableSpan(
              "default-begin",
              formatTextArray(defaultBeginText)
            )}
          <Content
            contentId={subtree.element_id}
            rawContent={rawContent}
            contentRenderStatus={renderStatus}
            inlineOptions={[]}
            parentRenderStatus={parentInfo.lastCriticalRenderStatus}
            paragraphOption={id}
            isPreviewOnly={isPreviewOnly}
            scheduleNum={scheduleNum}
            preserveBracketFormats={true}
          />
          {defaultEndText.length > 0 &&
            createNonEditableSpan(
              "default-end",
              formatTextArray(defaultEndText)
            )}
        </p>
      );
    }

    // Handle case with inline options
    if (inlineOptions.length > 0) {
      return (
        <p style={INLINE_STYLES.inlineContainer}>
          {processInlineOptions(rawContent)}
        </p>
      );
    }

    // Handle case with no options
    const processedNormalContent = processNormalParagraph(rawContent);

    return (
      <p style={INLINE_STYLES.inlineContainer}>{processedNormalContent}</p>
    );
  }, [
    inlineOptionsStateKey,
    optionInfoStateKey,
    subtree.text,
    subtree.content,
    subtree.element_id,
    subtree.resetVersion,
    defaultBeginText,
    defaultEndText,
    renderStatus,
    parentInfo.lastCriticalRenderStatus,
    id,
    isPreviewOnly,
    scheduleNum,
    optionInfo,
    optionState,
    parentOptionIdShown,
  ]);

  // Layout calculations
  const isHeadline = parentInfo.level <= 1;
  const isGrandchild = parentInfo.level >= 3;
  const numberingMinWidth = isPreviewOnly ? "2.5em" : "2.2em";

  const divStyle = {
    ...renderHandler.getParagraphStyle(
      renderStatus,
      parentInfo.lastCriticalRenderStatus
    ),
    ...(isPreviewOnly && {
      marginBottom: "8pt",
      clear: "both",
      overflow: "hidden",
      position: "relative",
    }),
  };

  const flexContainerStyle = {
    ...INLINE_STYLES.flexContainer,
    ...(isGrandchild && { marginLeft: "2.6em" }),
    ...(isPreviewOnly && { marginBottom: "6pt", clear: "both" }),
  };

  const NumberingComponent = (
    <div
      style={{
        ...INLINE_STYLES.numberingContainer,
        minWidth: numberingMinWidth,
        marginRight: "0.4em",
      }}
    >
      <span>{numberingString}</span>
    </div>
  );

  const renderContent = () => {
    if (isHeadline) {
      return (
        <>
          <div
            style={{
              ...INLINE_STYLES.numberingContainer,
              minWidth: numberingMinWidth,
              marginRight: "0.2em",
            }}
          >
            <h1 style={INLINE_STYLES.headline}>{numberingString}</h1>
          </div>
          <div>
            <h1 style={INLINE_STYLES.headline}>{ContentComponent}</h1>
          </div>
        </>
      );
    }

    return (
      <>
        {NumberingComponent}
        <div style={isGrandchild ? { marginLeft: "0.7em" } : {}}>
          {ContentComponent}
        </div>
      </>
    );
  };

  // Propagate suppressOptionBracket to children
  const propagateSuppress =
    suppressOptionBracket ||
    (optionInfo && optionState !== undefined && optionState !== "default");

  // If this paragraph has an option that is active (shown or choice selected) AND has children,
  // propagate that the parent option is shown so children don't render closing brackets
  const isThisOptionActive =
    optionInfo &&
    optionState !== undefined &&
    optionState !== "default" &&
    optionState !== "hidden";
  const propagateParentOptionIdShown =
    parentOptionIdShown || (isThisOptionActive && hasChildren);

  return (
    <div style={divStyle} id={id}>
      <div style={flexContainerStyle}>{renderContent()}</div>
      <Children
        listOfParagraphs={subtree.children}
        parentInfoToPass={newParentInfo}
        isPreviewOnly={isPreviewOnly}
        scheduleNum={scheduleNum}
        suppressOptionBracket={propagateSuppress}
        parentOptionIdShown={propagateParentOptionIdShown}
      />
    </div>
  );
}

export default Paragraph;
