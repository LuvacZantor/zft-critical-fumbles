console.log("[ZFT] 👁️ v0.5.4 | Gaze of Two Minds feature automation loading");

globalThis.ZFTFA ??= {
  MODULE_ID: "zft-feature-automation"
};

ZFTFA.GazeOfTwoMinds = {
  get featureName() {
    return ZFTFA.FEATURES?.GAZE_OF_TWO_MINDS
      ?? "Eldritch Invocations: Gaze of Two Minds";
  },

  get linkFlag() {
    return ZFTFA.FLAGS?.GAZE_LINK
      ?? "gazeOfTwoMindsLink";
  },

  get proxyFlag() {
    return ZFTFA.FLAGS?.GAZE_PROXY
      ?? "gazeOfTwoMindsProxy";
  },
  get castingFlag() {
	  return ZFTFA.FLAGS?.GAZE_CASTING
		?? "gazeOfTwoMindsCasting";
},

 /**
 * Register the Gaze service and token lifecycle hooks.
 */
async register() {
  ZFTFA.log("👁️ Gaze of Two Minds | Registering feature services");

  ZFTFA.log("🔎 Gaze of Two Minds | Feature configuration resolved", {
    featureName: this.featureName,
    linkFlag: this.linkFlag,
    proxyFlag: this.proxyFlag
  });

  this.registerHooks();
	this.registerCastingHooks();
  ZFTFA.log(
    "✅ Gaze of Two Minds | Link-state, proxy-token, and movement-sync services registered"
  );
},

/**
 * Register token synchronization hooks exactly once.
 */
registerHooks() {
  if (this._hooksRegistered) {
    ZFTFA.warn(
      "⚠️ Gaze of Two Minds | Hook registration skipped because hooks are already active"
    );
    return;
  }

  this._hooksRegistered = true;

  Hooks.on(
    "updateToken",
    async (tokenDocument, changes, options, userId) => {
      try {
        await this.handleTokenUpdate(
          tokenDocument,
          changes,
          options,
          userId
        );
      } catch (error) {
        ZFTFA.error(
          "❌ Gaze of Two Minds | Unhandled movement synchronization failure",
          {
            tokenUuid: tokenDocument?.uuid,
            changes,
            userId,
            error
          }
        );
      }
    }
  );

  Hooks.on(
    "deleteToken",
    async (tokenDocument, options, userId) => {
      try {
        await this.handleTokenDeletion(
          tokenDocument,
          options,
          userId
        );
      } catch (error) {
        ZFTFA.error(
          "❌ Gaze of Two Minds | Unhandled token deletion cleanup failure",
          {
            tokenUuid: tokenDocument?.uuid,
            userId,
            error
          }
        );
      }
    }
  );

	ZFTFA.log(
	  "✅ Gaze of Two Minds | Link, proxy, movement, combat, and casting-origin services registered"
	);
},

/**
 * Register casting-origin diagnostics and proxy combat protection.
 */
registerCastingHooks() {
  if (this._castingHooksRegistered) {
    ZFTFA.warn(
      "⚠️ Gaze of Two Minds | Casting hook registration skipped because hooks are already active"
    );

    return;
  }

  this._castingHooksRegistered = true;

  Hooks.on(
    "preCreateCombatant",
    (combatantDocument, createData, options, userId) => {
      try {
        return this.handlePreCreateCombatant(
          combatantDocument,
          createData,
          options,
          userId
        );
      } catch (error) {
        ZFTFA.error(
          "❌ Gaze of Two Minds | Proxy combatant protection failed",
          {
            tokenId: createData?.tokenId,
            sceneId: createData?.sceneId,
            userId,
            error
          }
        );

        return false;
      }
    }
  );

  Hooks.on(
    "midi-qol.preTargetingV2",
    async (workflow, usage, dialog, message) => {
      try {
        return await this.handleCastingWorkflowDiagnostic(
          "preTargetingV2",
          workflow,
          usage,
          dialog,
          message
        );
      } catch (error) {
        ZFTFA.error(
          "❌ Gaze of Two Minds | preTargetingV2 diagnostic failed",
          {
            workflowUuid: workflow?.uuid,
            itemUuid: workflow?.item?.uuid,
            error
          }
        );

        return true;
      }
    }
  );

Hooks.on(
  "midi-qol.preItemRoll",
  async (workflow, usage, dialog, message) => {
    try {
      return await this.handleCastingOriginRedirect(
        workflow,
        usage,
        dialog,
        message
      );
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze Origin | preItemRoll origin redirect failed",
        {
          activityUuid: workflow?.activity?.uuid,
          actorUuid:
            workflow?.activity?.actor?.uuid
            ?? workflow?.actor?.uuid
            ?? null,
          error
        }
      );

      return true;
    }
  }
);

  Hooks.on(
  "dnd5e.preUseActivity",
  async (
    activity,
    usageConfig,
    dialogConfig,
    messageConfig
  ) => {
    try {
      return await this.handlePreUseActivityOriginRedirect(
        activity,
        usageConfig,
        dialogConfig,
        messageConfig
      );
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze Origin | dnd5e.preUseActivity origin redirect failed",
        {
          activity: activity?.name,
          activityUuid: activity?.uuid,
          itemUuid: activity?.item?.uuid,
          actorUuid:
            activity?.actor?.uuid
            ?? activity?.item?.actor?.uuid
            ?? null,
          error
        }
      );

      return true;
    }
  }
);

  ZFTFA.log(
    "✅ Gaze of Two Minds | Casting diagnostics and proxy combat protection registered"
  );
},

/**
 * Return the stored Gaze Origin casting state.
 *
 * @param {Actor} actor
 * @returns {{enabled: boolean, enabledAtTimestamp?: number, enabledByUserId?: string}}
 */
getCastingState(actor) {
  if (!actor) {
    return {
      enabled: false
    };
  }

  return actor.getFlag(
    ZFTFA.MODULE_ID,
    this.castingFlag
  ) ?? {
    enabled: false
  };
},

/**
 * Determine whether Gaze Origin mode is enabled.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
isCastingEnabled(actor) {
  return this.getCastingState(actor).enabled === true;
},

/**
 * Enable or disable Gaze Origin mode.
 *
 * @param {Actor} actor
 * @param {boolean} enabled
 * @returns {Promise<boolean>}
 */
async setCastingEnabled(actor, enabled) {
  if (!actor) {
    ZFTFA.error(
      "❌ Gaze Origin | Casting mode update failed: actor was not provided"
    );

    return false;
  }

  if (!enabled) {
    try {
      await actor.unsetFlag(
        ZFTFA.MODULE_ID,
        this.castingFlag
      );
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze Origin | Failed to disable casting mode",
        {
          actor: actor.name,
          actorUuid: actor.uuid,
          error
        }
      );

      return false;
    }

    ZFTFA.log(
      `✅ Gaze Origin | Disabled for ${actor.name}`,
      {
        actorUuid: actor.uuid
      }
    );

    return true;
  }

  const validation = await this.validate(actor);

  if (!validation.valid) {
    ZFTFA.warn(
      "⚠️ Gaze Origin | Cannot enable because the Gaze link is invalid",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        reason: validation.reason
      }
    );

    return false;
  }

  const castingState = {
    enabled: true,
    sourceTokenUuid: validation.sourceToken.uuid,
    linkedTokenUuid: validation.linkedToken.uuid,
    proxyTokenUuid: validation.proxyToken.uuid,
    enabledByUserId: game.user.id,
    enabledAtTimestamp: Date.now()
  };

  try {
    await actor.setFlag(
      ZFTFA.MODULE_ID,
      this.castingFlag,
      castingState
    );
  } catch (error) {
    ZFTFA.error(
      "❌ Gaze Origin | Failed to enable casting mode",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        castingState,
        error
      }
    );

    return false;
  }

  ZFTFA.log(
    `✅ Gaze Origin | Enabled through ${validation.linkedToken.name}`,
    {
      actor: actor.name,
      actorUuid: actor.uuid,
      linkedToken: validation.linkedToken.name,
      linkedTokenUuid: validation.linkedToken.uuid,
      proxyTokenUuid: validation.proxyToken.uuid
    }
  );

  return true;
},

/**
 * Toggle Gaze Origin mode for an actor.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
async toggleCasting(actor) {
  const currentlyEnabled = this.isCastingEnabled(actor);

  const updated = await this.setCastingEnabled(
    actor,
    !currentlyEnabled
  );

  if (!updated) {
    return currentlyEnabled;
  }

  return !currentlyEnabled;
},

/**
 * Resolve the current proxy origin for a casting actor.
 *
 * @param {Actor} actor
 * @returns {Promise<object>}
 */
async resolveCastingOrigin(actor) {
  if (!actor) {
    return {
      valid: false,
      reason: "missing-actor",
      sourceToken: null,
      linkedToken: null,
      proxyToken: null
    };
  }

  if (!this.isCastingEnabled(actor)) {
    return {
      valid: false,
      reason: "casting-mode-disabled",
      sourceToken: null,
      linkedToken: null,
      proxyToken: null
    };
  }

  const validation = await this.validate(actor);

  if (!validation.valid) {
    await this.setCastingEnabled(
      actor,
      false
    );

    ZFTFA.warn(
      "⚠️ Gaze Origin | Disabled automatically because link validation failed",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        reason: validation.reason
      }
    );

    return validation;
  }

  return validation;
},

/**
 * Prevent Gaze proxy tokens from becoming combatants.
 *
 * @param {Combatant} combatantDocument
 * @param {object} createData
 * @param {object} options
 * @param {string} userId
 * @returns {boolean}
 */
handlePreCreateCombatant(
  combatantDocument,
  createData,
  options = {},
  userId
) {
  const sceneId =
    createData?.sceneId
    ?? combatantDocument?.sceneId
    ?? canvas.scene?.id
    ?? null;

  const tokenId =
    createData?.tokenId
    ?? combatantDocument?.tokenId
    ?? null;

  if (!sceneId || !tokenId) {
    return true;
  }

  const scene = game.scenes.get(sceneId);
  const tokenDocument = scene?.tokens.get(tokenId);

  if (!tokenDocument || !this.isProxy(tokenDocument)) {
    return true;
  }

  ZFTFA.warn(
    "⚠️ Gaze of Two Minds | Prevented proxy token from entering combat",
    {
      proxyToken: tokenDocument.name,
      proxyTokenUuid: tokenDocument.uuid,
      combatUuid: combatantDocument?.parent?.uuid,
      initiatingUserId: userId
    }
  );

  if (userId === game.user.id) {
    ui.notifications.warn(
      "Gaze proxy tokens cannot be added to combat."
    );
  }

  return false;
},
/**
 * Redirect the activity's spatial token to the active Gaze proxy.
 *
 * The actor, item, resources, and combatant remain unchanged.
 *
 * @param {object} workflow
 * @param {object} usage
 * @param {object} dialog
 * @param {object} message
 * @returns {Promise<boolean>}
 */
async handleCastingOriginRedirect(
  workflow,
  usage,
  dialog,
  message
) {
  const actor =
    workflow?.activity?.actor
    ?? workflow?.actor
    ?? workflow?.item?.actor
    ?? null;

  if (!actor || !this.isCastingEnabled(actor)) {
    return true;
  }

  const origin = await this.resolveCastingOrigin(actor);

  if (!origin.valid) {
    ZFTFA.warn(
      "⚠️ Gaze Origin | Casting continued from the original token because origin resolution failed",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        reason: origin.reason
      }
    );

    return true;
  }

  const originalToken =
    workflow?.token?.document
    ?? workflow?.token
    ?? null;

  const proxyTokenObject =
    origin.proxyToken.object
    ?? canvas.tokens.get(origin.proxyToken.id)
    ?? null;

  const replacementToken =
    proxyTokenObject
    ?? origin.proxyToken;

  if (!replacementToken) {
    ZFTFA.error(
      "❌ Gaze Origin | Proxy token has no usable canvas or document representation",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        proxyTokenUuid: origin.proxyToken.uuid
      }
    );

    return true;
  }

  workflow.token = replacementToken;

  const appliedToken =
    workflow?.token?.document
    ?? workflow?.token
    ?? null;

  const appliedTokenUuid =
    appliedToken?.uuid
    ?? workflow?.token?.document?.uuid
    ?? null;

  if (appliedTokenUuid !== origin.proxyToken.uuid) {
    ZFTFA.error(
      "❌ Gaze Origin | Workflow token replacement did not persist",
      {
        actor: actor.name,
        activity: workflow?.activity?.name,
        activityUuid: workflow?.activity?.uuid,
        originalTokenUuid: originalToken?.uuid,
        expectedProxyTokenUuid: origin.proxyToken.uuid,
        appliedTokenUuid
      }
    );

    return true;
  }

  ZFTFA.log(
    "✅ Gaze Origin | Activity spatial origin redirected to proxy",
    {
      actor: actor.name,
      actorUuid: actor.uuid,

      item:
        workflow?.activity?.item?.name
        ?? workflow?.item?.name
        ?? null,

      activity: workflow?.activity?.name,
      activityUuid: workflow?.activity?.uuid,

      originalToken: originalToken?.name,
      originalTokenUuid: originalToken?.uuid,

      linkedToken: origin.linkedToken.name,
      linkedTokenUuid: origin.linkedToken.uuid,

      proxyToken: origin.proxyToken.name,
      proxyTokenUuid: origin.proxyToken.uuid,

      appliedTokenUuid
    }
  );

  return true;
},

/**
 * Inspect the current MidiQOL casting context without modifying it.
 *
 * @param {string} phase
 * @param {object} workflow
 * @param {object} usage
 * @param {object} dialog
 * @param {object} message
 * @returns {Promise<boolean>}
 */
async handleCastingWorkflowDiagnostic(
  phase,
  workflow,
  usage,
  dialog,
  message
) {
  const actor =
    workflow?.actor
    ?? workflow?.activity?.actor
    ?? workflow?.item?.actor
    ?? null;

  if (!actor || !this.isCastingEnabled(actor)) {
    return true;
  }

  const origin = await this.resolveCastingOrigin(actor);

  if (!origin.valid) {
    ZFTFA.warn(
      `⚠️ Gaze Origin | ${phase} continued from the normal token because proxy resolution failed`,
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        reason: origin.reason
      }
    );

    return true;
  }

  const workflowTokenDocument =
    workflow?.token?.document
    ?? workflow?.token
    ?? null;

  const flattenedWorkflow = {
    keys: Object.keys(workflow ?? {}),

    token: workflowTokenDocument?.name
      ?? null,

    tokenUuid: workflowTokenDocument?.uuid
      ?? null,

    tokenId: workflow?.tokenId
      ?? null,

    actorUuid: workflow?.actor?.uuid
      ?? workflow?.activity?.actor?.uuid
      ?? null,

    itemUuid: workflow?.item?.uuid
      ?? workflow?.activity?.item?.uuid
      ?? null,

    activityUuid: workflow?.activity?.uuid
      ?? null,

    configKeys: Object.keys(
      workflow?.config ?? {}
    ),

    configToken:
      workflow?.config?.token?.name
      ?? workflow?.config?.token?.document?.name
      ?? null,

    configTokenUuid:
      workflow?.config?.token?.uuid
      ?? workflow?.config?.token?.document?.uuid
      ?? workflow?.config?.tokenUuid
      ?? null
  };

  ZFTFA.log(
    `🔎 Gaze Origin | ${phase} casting context`,
    {
      actor: actor.name,
      actorUuid: actor.uuid,

      item: workflow?.item?.name
        ?? workflow?.activity?.item?.name
        ?? null,

      itemUuid: workflow?.item?.uuid
        ?? workflow?.activity?.item?.uuid
        ?? null,

      activity: workflow?.activity?.name,
      activityUuid: workflow?.activity?.uuid,

      workflowUuid: workflow?.uuid,

      workflowToken: workflowTokenDocument?.name,
      workflowTokenUuid: workflowTokenDocument?.uuid,

      sourceToken: origin.sourceToken.name,
      sourceTokenUuid: origin.sourceToken.uuid,

      linkedToken: origin.linkedToken.name,
      linkedTokenUuid: origin.linkedToken.uuid,

      intendedOrigin: origin.proxyToken.name,
      intendedOriginUuid: origin.proxyToken.uuid,

      workflowKeys: Object.keys(workflow ?? {}),

      workflowConfig: foundry.utils.deepClone(
        workflow?.config ?? null
      ),

      usage: foundry.utils.deepClone(
        usage ?? null
      ),

      dialog: foundry.utils.deepClone(
        dialog ?? null
      ),

      message: foundry.utils.deepClone(
        message ?? null
      )
    }
  );

ZFTFA.log(
  `🔎 Gaze Origin | ${phase} flattened workflow JSON`,
  JSON.stringify(
    {
      actor: actor.name,
      activity: workflow?.activity?.name,
      sourceTokenUuid: origin.sourceToken.uuid,
      intendedOriginUuid: origin.proxyToken.uuid,
      workflow: flattenedWorkflow
    },
    null,
    2
  )
);

  ZFTFA.log(
    `✅ Gaze Origin | ${phase} diagnostic completed without modifying the workflow`
  );

  return true;
},

/**
 * Redirect the DnD5e activity workflow token before MidiQOL performs
 * range, visibility, cover, and other spatial checks.
 *
 * The workflow tokenUuid property is a derived read-only getter in the
 * current MidiQOL workflow implementation. Assigning workflow.token updates
 * the derived UUID automatically.
 *
 * The source actor, item, resources, and combatant remain unchanged.
 *
 * @param {Activity} activity
 * @param {object} usageConfig
 * @param {object} dialogConfig
 * @param {object} messageConfig
 * @returns {Promise<boolean>}
 */
async handlePreUseActivityOriginRedirect(
  activity,
  usageConfig,
  dialogConfig,
  messageConfig
) {
  const actor =
    activity?.actor
    ?? activity?.item?.actor
    ?? null;

  if (!actor || !this.isCastingEnabled(actor)) {
    return true;
  }

  const origin = await this.resolveCastingOrigin(actor);

  if (!origin.valid) {
    ZFTFA.warn(
      "⚠️ Gaze Origin | preUseActivity continued from the original token because proxy resolution failed",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        activity: activity?.name,
        activityUuid: activity?.uuid,
        reason: origin.reason
      }
    );

    return true;
  }

  const usageWorkflow =
    usageConfig?.workflow
    ?? null;

  if (!usageWorkflow) {
    ZFTFA.error(
      "❌ Gaze Origin | preUseActivity could not redirect because usageConfig.workflow is missing",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        activity: activity?.name,
        activityUuid: activity?.uuid,
        usageConfigKeys: Object.keys(
          usageConfig ?? {}
        )
      }
    );

    return true;
  }

  const proxyTokenDocument =
    this.resolveTokenDocument(origin.proxyToken);

  if (!proxyTokenDocument) {
    ZFTFA.error(
      "❌ Gaze Origin | preUseActivity could not resolve the proxy TokenDocument",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        activity: activity?.name,
        activityUuid: activity?.uuid,
        proxyTokenUuid: origin.proxyToken?.uuid
      }
    );

    return true;
  }

  const proxyTokenObject =
    proxyTokenDocument.object
    ?? canvas.tokens.get(proxyTokenDocument.id)
    ?? null;

  if (!proxyTokenObject) {
    ZFTFA.error(
      "❌ Gaze Origin | preUseActivity could not resolve the proxy canvas token",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        activity: activity?.name,
        activityUuid: activity?.uuid,
        proxyTokenUuid: proxyTokenDocument.uuid,
        proxyTokenId: proxyTokenDocument.id,
        activeSceneUuid: canvas.scene?.uuid
      }
    );

    return true;
  }

  const originalWorkflowToken =
    usageWorkflow?.token?.document
    ?? usageWorkflow?.token
    ?? null;

  const originalWorkflowTokenUuid =
    originalWorkflowToken?.uuid
    ?? usageWorkflow?.tokenUuid
    ?? null;

  ZFTFA.log(
    "🔄 Gaze Origin | Redirecting preUseActivity workflow origin",
    {
      actor: actor.name,
      actorUuid: actor.uuid,

      item: activity?.item?.name,
      itemUuid: activity?.item?.uuid,

      activity: activity?.name,
      activityUuid: activity?.uuid,

      originalToken: originalWorkflowToken?.name,
      originalTokenUuid: originalWorkflowTokenUuid,

      linkedToken: origin.linkedToken.name,
      linkedTokenUuid: origin.linkedToken.uuid,

      proxyToken: proxyTokenDocument.name,
      proxyTokenUuid: proxyTokenDocument.uuid
    }
  );

  try {
    usageWorkflow.token = proxyTokenObject;
  } catch (error) {
    ZFTFA.error(
      "❌ Gaze Origin | preUseActivity workflow token assignment threw an exception",
      {
        actor: actor.name,
        actorUuid: actor.uuid,
        activity: activity?.name,
        activityUuid: activity?.uuid,
        originalWorkflowTokenUuid,
        expectedProxyTokenUuid: proxyTokenDocument.uuid,
        error
      }
    );

    return true;
  }

  const appliedWorkflowToken =
    usageWorkflow?.token?.document
    ?? usageWorkflow?.token
    ?? null;

  const appliedWorkflowTokenUuid =
    appliedWorkflowToken?.uuid
    ?? null;

  const derivedWorkflowTokenUuid =
    usageWorkflow?.tokenUuid
    ?? null;

  const tokenObjectMatches =
    appliedWorkflowTokenUuid === proxyTokenDocument.uuid;

  const derivedTokenUuidMatches =
    derivedWorkflowTokenUuid === proxyTokenDocument.uuid;

  ZFTFA.log(
    "🔎 Gaze Origin | preUseActivity redirect verification",
    {
      actor: actor.name,
      actorUuid: actor.uuid,

      activity: activity?.name,
      activityUuid: activity?.uuid,

      expectedProxyTokenUuid: proxyTokenDocument.uuid,
      appliedWorkflowTokenUuid,
      derivedWorkflowTokenUuid,

      tokenObjectMatches,
      derivedTokenUuidMatches
    }
  );

  if (!tokenObjectMatches || !derivedTokenUuidMatches) {
    ZFTFA.error(
      "❌ Gaze Origin | preUseActivity workflow origin replacement did not persist",
      {
        actor: actor.name,
        actorUuid: actor.uuid,

        activity: activity?.name,
        activityUuid: activity?.uuid,

        originalWorkflowTokenUuid,
        expectedProxyTokenUuid: proxyTokenDocument.uuid,

        appliedWorkflowTokenUuid,
        derivedWorkflowTokenUuid,

        tokenObjectMatches,
        derivedTokenUuidMatches
      }
    );

    return true;
  }

  ZFTFA.log(
    "✅ Gaze Origin | preUseActivity spatial origin redirected to proxy",
    {
      actor: actor.name,
      actorUuid: actor.uuid,

      item: activity?.item?.name,
      itemUuid: activity?.item?.uuid,

      activity: activity?.name,
      activityUuid: activity?.uuid,

      sourceTokenUuid: origin.sourceToken.uuid,
      linkedTokenUuid: origin.linkedToken.uuid,
      proxyTokenUuid: proxyTokenDocument.uuid,

      tokenObjectMatches,
      derivedTokenUuidMatches
    }
  );

  return true;
},

/**
 * Synchronize proxies when their linked creature moves.
 *
 * Only the active GM performs document updates. This avoids every connected
 * client attempting to update the same proxy.
 *
 * @param {TokenDocument} tokenDocument
 * @param {object} changes
 * @param {object} options
 * @param {string} userId
 */
async handleTokenUpdate(
  tokenDocument,
  changes,
  options = {},
  userId
) {
  if (!game.user.isGM) return;

  if (!tokenDocument) return;

  if (options.zftGazeProxySync === true) {
    return;
  }

  if (this.isProxy(tokenDocument)) {
    return;
  }

  const synchronizedFields = [
    "x",
    "y",
    "elevation",
    "rotation",
    "sight",
    "detectionModes"
  ];

  const changedFields = synchronizedFields.filter(field =>
    Object.hasOwn(changes, field)
  );

  if (!changedFields.length) {
    return;
  }

  const scene = tokenDocument.parent;

  if (!scene) {
    ZFTFA.warn(
      "⚠️ Gaze of Two Minds | Proxy synchronization skipped: updated token has no parent scene",
      {
        tokenUuid: tokenDocument.uuid
      }
    );

    return;
  }

  const proxies = scene.tokens.filter(candidate => {
    const metadata = candidate.getFlag(
      ZFTFA.MODULE_ID,
      this.proxyFlag
    );

    return metadata?.linkedTokenUuid === tokenDocument.uuid;
  });

  if (!proxies.length) {
    return;
  }

  const linkedTokenData = tokenDocument.toObject();

  const updates = proxies.map(proxy => {
    const update = {
      _id: proxy.id
    };

    for (const field of changedFields) {
      if (
        field === "sight"
        || field === "detectionModes"
      ) {
        update[field] = foundry.utils.deepClone(
          linkedTokenData[field]
        );

        continue;
      }

      update[field] = changes[field];
    }

    return update;
  });

  ZFTFA.log(
    "🔄 Gaze of Two Minds | Synchronizing proxy state",
    {
      linkedToken: tokenDocument.name,
      linkedTokenUuid: tokenDocument.uuid,
      proxyCount: proxies.length,
      changedFields,
      perceptionSync: changedFields.some(field =>
        field === "sight"
        || field === "detectionModes"
      ),
      updates,
      initiatingUserId: userId
    }
  );

  try {
    await scene.updateEmbeddedDocuments(
      "Token",
      updates,
      {
        animate: false,
        zftGazeProxySync: true,
        zftGazeLinkedTokenUuid: tokenDocument.uuid
      }
    );
  } catch (error) {
    ZFTFA.error(
      "❌ Gaze of Two Minds | Proxy state synchronization failed",
      {
        linkedToken: tokenDocument.name,
        linkedTokenUuid: tokenDocument.uuid,
        proxyTokenUuids: proxies.map(proxy => proxy.uuid),
        changedFields,
        error
      }
    );

    return;
  }

  ZFTFA.log(
    `✅ Gaze of Two Minds | Proxy synchronized with ${tokenDocument.name}`,
    {
      linkedTokenUuid: tokenDocument.uuid,
      proxyTokenUuids: proxies.map(proxy => proxy.uuid),
      changedFields
    }
  );
},

/**
 * Clean link state when a source, linked, or proxy token is deleted.
 *
 * @param {TokenDocument} tokenDocument
 * @param {object} options
 * @param {string} userId
 */
async handleTokenDeletion(
  tokenDocument,
  options = {},
  userId
) {
  if (!game.user.isGM) return;

  if (!tokenDocument) return;

  if (options.zftGazeCleanup === true) {
    return;
  }

  const deletedProxyMetadata = tokenDocument.getFlag(
    ZFTFA.MODULE_ID,
    this.proxyFlag
  );

  if (deletedProxyMetadata) {
    await this.handleProxyDeletion(
      tokenDocument,
      deletedProxyMetadata,
      userId
    );

    return;
  }

  const scene = tokenDocument.parent;

  if (!scene) return;

  const affectedProxies = scene.tokens.filter(candidate => {
    const metadata = candidate.getFlag(
      ZFTFA.MODULE_ID,
      this.proxyFlag
    );

    if (!metadata) return false;

    return metadata.sourceTokenUuid === tokenDocument.uuid
      || metadata.linkedTokenUuid === tokenDocument.uuid;
  });

  if (!affectedProxies.length) {
    return;
  }

  ZFTFA.warn(
    "⚠️ Gaze of Two Minds | Link endpoint deleted; cleaning affected proxy links",
    {
      deletedToken: tokenDocument.name,
      deletedTokenUuid: tokenDocument.uuid,
      affectedProxyUuids: affectedProxies.map(proxy => proxy.uuid),
      initiatingUserId: userId
    }
  );

  for (const proxy of affectedProxies) {
    const metadata = proxy.getFlag(
      ZFTFA.MODULE_ID,
      this.proxyFlag
    );

    const sourceActor = await this.resolveUuid(
      metadata?.sourceActorUuid
    );

    if (sourceActor?.documentName !== "Actor") {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Could not resolve source actor during endpoint deletion cleanup",
        {
          sourceActorUuid: metadata?.sourceActorUuid,
          proxyTokenUuid: proxy.uuid
        }
      );

      continue;
    }

    const link = this.getLink(sourceActor);

    if (!link) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Source actor has no stored link during endpoint deletion cleanup",
        {
          sourceActorUuid: sourceActor.uuid,
          proxyTokenUuid: proxy.uuid
        }
      );

      continue;
    }

    const ended = await this.end(
      sourceActor,
      {
        reason: tokenDocument.uuid === metadata.sourceTokenUuid
          ? "source-token-deleted"
          : "linked-token-deleted"
      }
    );

    if (!ended) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Failed to clean link after endpoint deletion",
        {
          sourceActorUuid: sourceActor.uuid,
          deletedTokenUuid: tokenDocument.uuid,
          proxyTokenUuid: proxy.uuid
        }
      );
    }
  }
},

/**
 * Remove stale actor link state when a proxy is deleted manually.
 *
 * @param {TokenDocument} proxyDocument
 * @param {object} metadata
 * @param {string} userId
 */
async handleProxyDeletion(
  proxyDocument,
  metadata,
  userId
) {
  const sourceActor = await this.resolveUuid(
    metadata.sourceActorUuid
  );

  if (sourceActor?.documentName !== "Actor") {
    ZFTFA.error(
      "❌ Gaze of Two Minds | Deleted proxy source actor could not be resolved",
      {
        proxyTokenUuid: proxyDocument.uuid,
        sourceActorUuid: metadata.sourceActorUuid,
        initiatingUserId: userId
      }
    );
    return;
  }

  const link = this.getLink(sourceActor);

  if (!link) {
    ZFTFA.log(
      "🔎 Gaze of Two Minds | Deleted proxy had no remaining actor link state",
      {
        proxyTokenUuid: proxyDocument.uuid,
        sourceActorUuid: sourceActor.uuid
      }
    );
    return;
  }

  if (link.proxyTokenUuid !== proxyDocument.uuid) {
    ZFTFA.warn(
      "⚠️ Gaze of Two Minds | Deleted proxy does not match the actor's current proxy reference",
      {
        deletedProxyTokenUuid: proxyDocument.uuid,
        storedProxyTokenUuid: link.proxyTokenUuid,
        sourceActorUuid: sourceActor.uuid
      }
    );
    return;
  }

  try {
    await sourceActor.unsetFlag(
      ZFTFA.MODULE_ID,
      this.linkFlag
    );
  } catch (error) {
    ZFTFA.error(
      "❌ Gaze of Two Minds | Failed to remove link state after manual proxy deletion",
      {
        sourceActorUuid: sourceActor.uuid,
        proxyTokenUuid: proxyDocument.uuid,
        error
      }
    );
    return;
  }

  ZFTFA.log(
    `✅ Gaze of Two Minds | Link state cleared after proxy deletion for ${sourceActor.name}`,
    {
      sourceActorUuid: sourceActor.uuid,
      proxyTokenUuid: proxyDocument.uuid,
      initiatingUserId: userId
    }
  );
},

  /**
   * Resolve the feature item from an actor.
   *
   * Identifier matching is preferred so harmless item-name changes do not
   * break the automation. Exact-name matching remains as a fallback.
   *
   * @param {Actor} actor
   * @returns {Item|null}
   */
  getFeature(actor) {
    if (!actor) return null;

    const identifier = "eldritch-invocations-gaze-of-two-minds";

    return actor.items.find(item =>
      item.system?.identifier === identifier
      || item.name === this.featureName
    ) ?? null;
  },

  /**
   * Determine whether an actor possesses Gaze of Two Minds.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  hasFeature(actor) {
    return Boolean(this.getFeature(actor));
  },

  /**
   * Return the currently stored Gaze link.
   *
   * @param {Actor} actor
   * @returns {object|null}
   */
  getLink(actor) {
    if (!actor) return null;

    return actor.getFlag(
      ZFTFA.MODULE_ID,
      this.linkFlag
    ) ?? null;
  },

  /**
   * Determine whether a TokenDocument is a Gaze proxy.
   *
   * @param {Token|TokenDocument} token
   * @returns {boolean}
   */
  isProxy(token) {
    const tokenDocument = this.resolveTokenDocument(token);

    return Boolean(
      tokenDocument?.getFlag(
        ZFTFA.MODULE_ID,
        this.proxyFlag
      )
    );
  },

  /**
   * Establish a persistent source-to-linked-creature relationship.
   *
   * @param {object} options
   * @param {Token|TokenDocument} options.sourceToken
   * @param {Token|TokenDocument} options.linkedToken
   * @returns {Promise<object|null>}
   */
  async establish({
    sourceToken,
    linkedToken
  } = {}) {
    const sourceDocument = this.resolveTokenDocument(sourceToken);
    const linkedDocument = this.resolveTokenDocument(linkedToken);

    ZFTFA.log("👁️ Gaze of Two Minds | Establish request received", {
      sourceToken: sourceDocument?.name,
      sourceTokenUuid: sourceDocument?.uuid,
      linkedToken: linkedDocument?.name,
      linkedTokenUuid: linkedDocument?.uuid
    });

    if (!sourceDocument) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Establish failed: source token could not be resolved"
      );
      return null;
    }

    if (!linkedDocument) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Establish failed: linked token could not be resolved"
      );
      return null;
    }

    const actor = sourceDocument.actor;

    if (!actor) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Establish failed: source token has no actor",
        {
          sourceTokenUuid: sourceDocument.uuid
        }
      );
      return null;
    }

    if (!this.hasFeature(actor)) {
      ZFTFA.warn(
        `⚠️ Gaze of Two Minds | Establish denied: ${actor.name} does not have ${this.featureName}`,
        {
          actorUuid: actor.uuid
        }
      );
      return null;
    }

    if (sourceDocument.uuid === linkedDocument.uuid) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Establish denied: source and linked token are the same token"
      );
      return null;
    }

    if (this.isProxy(sourceDocument) || this.isProxy(linkedDocument)) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Establish denied: a Gaze proxy cannot be used as either endpoint"
      );
      return null;
    }

    if (sourceDocument.parent?.uuid !== linkedDocument.parent?.uuid) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Establish denied: tokens are not on the same scene",
        {
          sourceSceneUuid: sourceDocument.parent?.uuid,
          linkedSceneUuid: linkedDocument.parent?.uuid
        }
      );
      return null;
    }

    const previousLink = this.getLink(actor);

    if (previousLink) {
      ZFTFA.log(
        "🔄 Gaze of Two Minds | Existing link will be cleaned before replacement",
        {
          actor: actor.name,
          previousLinkedTokenUuid: previousLink.linkedTokenUuid,
          previousProxyTokenUuid: previousLink.proxyTokenUuid
        }
      );

      const cleanupSucceeded = await this.end(actor, {
        reason: "replaced-by-new-link"
      });

      if (!cleanupSucceeded && this.getLink(actor)) {
        ZFTFA.error(
          "❌ Gaze of Two Minds | Establish aborted because the previous link could not be cleaned"
        );
        return null;
      }
    }

    const combat = game.combat;

    const linkData = {
      sourceActorUuid: actor.uuid,
      sourceTokenUuid: sourceDocument.uuid,
      linkedActorUuid: linkedDocument.actor?.uuid ?? null,
      linkedTokenUuid: linkedDocument.uuid,
      sceneUuid: sourceDocument.parent?.uuid ?? null,

      establishedByUserId: game.user.id,
      establishedAtWorldTime: game.time.worldTime,
      establishedAtTimestamp: Date.now(),

      combatId: combat?.id ?? null,
      combatRound: combat?.round ?? null,
      combatTurn: combat?.turn ?? null,

      proxyTokenUuid: null,
      active: true
    };

    try {
      await actor.setFlag(
        ZFTFA.MODULE_ID,
        this.linkFlag,
        linkData
      );
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Failed to persist initial link state",
        {
          actor: actor.name,
          actorUuid: actor.uuid,
          linkedTokenUuid: linkedDocument.uuid,
          error
        }
      );

      return null;
    }

    ZFTFA.log(
      `✅ Gaze of Two Minds | Link established: ${actor.name} → ${linkedDocument.name}`,
      linkData
    );

    const proxyDocument = await this.createProxy(actor);

    if (!proxyDocument) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy creation failed; rolling back link state",
        {
          actor: actor.name,
          linkedTokenUuid: linkedDocument.uuid
        }
      );

      await actor.unsetFlag(
        ZFTFA.MODULE_ID,
        this.linkFlag
      );

      ZFTFA.log(
        "🧹 Gaze of Two Minds | Incomplete link state removed after proxy failure"
      );

      return null;
    }

    return this.getLink(actor);
  },

  /**
   * Create a linked Warlock proxy token at the linked creature's location.
   *
   * This phase intentionally requires a GM client. SocketLib delegation will
   * be added after the token lifecycle itself is validated.
   *
   * @param {Actor} actor
   * @returns {Promise<TokenDocument|null>}
   */
  async createProxy(actor) {
    if (!actor) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy creation failed: actor was not provided"
      );
      return null;
    }

    if (!game.user.isGM) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Proxy creation currently requires a GM client"
      );
      return null;
    }

    const validation = await this.validate(actor, {
      requireProxy: false
    });

    if (!validation.valid) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy creation aborted: base link validation failed",
        {
          actor: actor.name,
          reason: validation.reason
        }
      );
      return null;
    }

    const {
      link,
      sourceToken,
      linkedToken
    } = validation;

    const scene = linkedToken.parent;

    if (!scene) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy creation failed: linked token has no parent scene"
      );
      return null;
    }

    if (link.proxyTokenUuid) {
      const existingProxy = await this.resolveUuid(
        link.proxyTokenUuid
      );

      if (existingProxy) {
        ZFTFA.warn(
          "⚠️ Gaze of Two Minds | Proxy creation skipped: stored proxy already exists",
          {
            proxyTokenUuid: existingProxy.uuid
          }
        );

        return existingProxy;
      }

      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Stored proxy UUID is stale; a replacement will be created",
        {
          staleProxyTokenUuid: link.proxyTokenUuid
        }
      );
    }

    let prototypeDocument;

    try {
      prototypeDocument = await actor.getTokenDocument({
        x: linkedToken.x,
        y: linkedToken.y
      });
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Actor#getTokenDocument failed",
        {
          actor: actor.name,
          actorUuid: actor.uuid,
          error
        }
      );
      return null;
    }

    const proxyData = prototypeDocument.toObject();

    delete proxyData._id;

    const proxyName = `${actor.name} [Gaze Proxy]`;

    foundry.utils.mergeObject(
      proxyData,
      {
        name: proxyName,
        actorId: actor.id,
        actorLink: true,

        x: linkedToken.x,
        y: linkedToken.y,
        elevation: linkedToken.elevation,
		
		rotation: linkedToken.rotation,

		sight: foundry.utils.deepClone(
		  linkedToken.toObject().sight
		),

		detectionModes: foundry.utils.deepClone(
		  linkedToken.toObject().detectionModes
		),

        width: sourceToken.width,
        height: sourceToken.height,

        disposition: sourceToken.disposition,
        hidden: false,
        locked: true,

        alpha: 0.45,

        displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
        displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,

        flags: {
          [ZFTFA.MODULE_ID]: {
            [this.proxyFlag]: {
              sourceActorUuid: actor.uuid,
              sourceTokenUuid: sourceToken.uuid,
              linkedTokenUuid: linkedToken.uuid,
              createdByUserId: game.user.id,
              createdAtTimestamp: Date.now()
            }
          }
        }
      },
      {
        inplace: true,
        insertKeys: true,
        insertValues: true,
        overwrite: true
      }
    );

		ZFTFA.log(
		  "🛠️ Gaze of Two Minds | Creating proxy token",
		  {
			actor: actor.name,
			scene: scene.name,
			linkedToken: linkedToken.name,
			x: proxyData.x,
			y: proxyData.y,
			elevation: proxyData.elevation,
			sight: proxyData.sight,
			detectionModes: proxyData.detectionModes,
			linkedActorSenses: foundry.utils.deepClone(
			  linkedToken.actor?.system?.attributes?.senses ?? {}
			)
		  }
		);

    let createdProxy;

    try {
      const created = await scene.createEmbeddedDocuments(
        "Token",
        [proxyData]
      );

      createdProxy = created[0] ?? null;
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Scene token creation failed",
        {
          actor: actor.name,
          sceneUuid: scene.uuid,
          error
        }
      );
      return null;
    }

  if (!createdProxy) {
	  ZFTFA.error(
		"❌ Gaze of Two Minds | Scene returned no created proxy document"
	  );

	  return null;
	}

	const linkedTokenData = linkedToken.toObject();

	const linkedPerception = {
	  sight: foundry.utils.deepClone(
		linkedTokenData.sight
	  ),

	  detectionModes: foundry.utils.deepClone(
		linkedTokenData.detectionModes
	  )
	};

	ZFTFA.log(
	  "🔄 Gaze of Two Minds | Applying persisted linked-token perception to proxy",
	  {
		proxyTokenUuid: createdProxy.uuid,
		linkedTokenUuid: linkedToken.uuid,
		sight: linkedPerception.sight,
		detectionModes: linkedPerception.detectionModes
	  }
	);

	try {
	  await createdProxy.update(
		linkedPerception,
		{
		  zftGazeProxySync: true,
		  zftGazePerceptionSync: true
		}
	  );
	} catch (error) {
	  ZFTFA.error(
		"❌ Gaze of Two Minds | Failed to apply linked-token perception after proxy creation",
		{
		  proxyTokenUuid: createdProxy.uuid,
		  linkedTokenUuid: linkedToken.uuid,
		  linkedPerception,
		  error
		}
	  );

	  try {
		await scene.deleteEmbeddedDocuments(
		  "Token",
		  [createdProxy.id],
		  {
			zftGazeCleanup: true
		  }
		);

		ZFTFA.log(
		  "🧹 Gaze of Two Minds | Proxy deleted after perception synchronization failure"
		);
	  } catch (cleanupError) {
		ZFTFA.error(
		  "❌ Gaze of Two Minds | Failed to delete proxy after perception synchronization failure",
		  {
			proxyTokenUuid: createdProxy.uuid,
			cleanupError
		  }
		);
	  }

	  return null;
	}

	createdProxy = scene.tokens.get(createdProxy.id)
	  ?? createdProxy;

	const persistedProxyData = createdProxy.toObject();

	const perceptionMatches = {
	  sight: foundry.utils.objectsEqual(
		linkedTokenData.sight,
		persistedProxyData.sight
	  ),

	  detectionModes: foundry.utils.objectsEqual(
		linkedTokenData.detectionModes,
		persistedProxyData.detectionModes
	  )
	};

	if (!perceptionMatches.sight) {
  ZFTFA.error(
    "❌ Gaze of Two Minds | Proxy sight failed persistence verification",
		{
		  proxyTokenUuid: createdProxy.uuid,
		  linkedTokenUuid: linkedToken.uuid,
		  linkedSight: foundry.utils.deepClone(
			linkedTokenData.sight
		  ),
		  proxySight: foundry.utils.deepClone(
			persistedProxyData.sight
		  )
		}
	  );

	  try {
		await scene.deleteEmbeddedDocuments(
		  "Token",
		  [createdProxy.id],
		  {
			zftGazeCleanup: true
		  }
		);

		ZFTFA.log(
		  "🧹 Gaze of Two Minds | Proxy deleted after sight verification failure"
		);
	  } catch (cleanupError) {
		ZFTFA.error(
		  "❌ Gaze of Two Minds | Failed to delete proxy after sight verification failure",
		  {
			proxyTokenUuid: createdProxy.uuid,
			cleanupError
		  }
		);
	  }

	  return null;
	}

	if (!perceptionMatches.detectionModes) {
	  ZFTFA.warn(
		"⚠️ Gaze of Two Minds | Detection modes were normalized during proxy persistence",
		{
		  proxyTokenUuid: createdProxy.uuid,
		  linkedTokenUuid: linkedToken.uuid,
		  linkedDetectionModes: foundry.utils.deepClone(
			linkedTokenData.detectionModes
		  ),
		  proxyDetectionModes: foundry.utils.deepClone(
			persistedProxyData.detectionModes
		  )
		}
	  );
	}

	ZFTFA.log(
	  "✅ Gaze of Two Minds | Proxy perception applied",
	  {
		proxyTokenUuid: createdProxy.uuid,
		linkedTokenUuid: linkedToken.uuid,
		sightMatches: perceptionMatches.sight,
		detectionModesMatch: perceptionMatches.detectionModes
	  }
	);

    const updatedLink = {
      ...link,
      proxyTokenUuid: createdProxy.uuid
    };

    try {
      await actor.setFlag(
        ZFTFA.MODULE_ID,
        this.linkFlag,
        updatedLink
      );
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Failed to record proxy UUID; deleting orphaned proxy",
        {
          actor: actor.name,
          proxyTokenUuid: createdProxy.uuid,
          error
        }
      );

      try {
			await scene.deleteEmbeddedDocuments(
			  "Token",
			  [createdProxy.id],
			  {
				zftGazeCleanup: true
			  }
			);

        ZFTFA.log(
          "🧹 Gaze of Two Minds | Orphaned proxy deleted after flag update failure"
        );
      } catch (cleanupError) {
        ZFTFA.error(
          "❌ Gaze of Two Minds | Failed to delete orphaned proxy",
          {
            proxyTokenUuid: createdProxy.uuid,
            cleanupError
          }
        );
      }

      return null;
    }

    ZFTFA.log(
      `✅ Gaze of Two Minds | Proxy created for ${actor.name}`,
      {
        proxyName: createdProxy.name,
        proxyTokenUuid: createdProxy.uuid,
        linkedTokenUuid: linkedToken.uuid,
        actorLink: createdProxy.actorLink
      }
    );

    return createdProxy;
  },

  /**
   * Delete the proxy referenced by an actor's stored Gaze link.
   *
   * @param {Actor} actor
   * @returns {Promise<boolean>}
   */
  async deleteProxy(actor) {
    if (!actor) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy deletion failed: actor was not provided"
      );
      return false;
    }

    const link = this.getLink(actor);

    if (!link?.proxyTokenUuid) {
      ZFTFA.log(
        `🔎 Gaze of Two Minds | No proxy recorded for ${actor.name}`
      );
      return true;
    }

    if (!game.user.isGM) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Proxy deletion currently requires a GM client",
        {
          proxyTokenUuid: link.proxyTokenUuid
        }
      );
      return false;
    }

    const proxyDocument = await this.resolveUuid(
      link.proxyTokenUuid
    );

    if (!proxyDocument) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Stored proxy no longer exists; treating it as already deleted",
        {
          proxyTokenUuid: link.proxyTokenUuid
        }
      );
      return true;
    }

    if (proxyDocument.documentName !== "Token") {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Stored proxy UUID did not resolve to a TokenDocument",
        {
          proxyTokenUuid: link.proxyTokenUuid,
          documentName: proxyDocument.documentName
        }
      );
      return false;
    }

    const proxyMetadata = proxyDocument.getFlag(
      ZFTFA.MODULE_ID,
      this.proxyFlag
    );

    if (!proxyMetadata) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Refusing to delete token because it lacks the Gaze proxy flag",
        {
          proxyTokenUuid: proxyDocument.uuid,
          proxyName: proxyDocument.name
        }
      );
      return false;
    }

    const scene = proxyDocument.parent;

    if (!scene) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy deletion failed: proxy has no parent scene",
        {
          proxyTokenUuid: proxyDocument.uuid
        }
      );
      return false;
    }

    try {
		await scene.deleteEmbeddedDocuments(
		  "Token",
		  [proxyDocument.id],
		  {
			zftGazeCleanup: true
		  }
		);
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Proxy token deletion failed",
        {
          actor: actor.name,
          proxyTokenUuid: proxyDocument.uuid,
          sceneUuid: scene.uuid,
          error
        }
      );
      return false;
    }

    ZFTFA.log(
      `✅ Gaze of Two Minds | Proxy deleted for ${actor.name}`,
      {
        proxyTokenUuid: proxyDocument.uuid,
        proxyName: proxyDocument.name
      }
    );

    return true;
  },

  /**
   * End the current Gaze link and remove its proxy.
   *
   * @param {Actor} actor
   * @param {object} options
   * @param {string} options.reason
   * @returns {Promise<boolean>}
   */
  async end(
    actor,
    {
      reason = "manual"
    } = {}
  ) {
    if (!actor) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | End failed: actor was not provided"
      );
      return false;
    }

    const existingLink = this.getLink(actor);

    if (!existingLink) {
      ZFTFA.log(
        `🔎 Gaze of Two Minds | No active link to end for ${actor.name}`
      );
      return false;
    }

    const proxyDeleted = await this.deleteProxy(actor);

    if (!proxyDeleted) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | End aborted because proxy cleanup failed",
        {
          actor: actor.name,
          proxyTokenUuid: existingLink.proxyTokenUuid,
          reason
        }
      );
      return false;
    }
		if (this.isCastingEnabled(actor)) {
		  const castingDisabled = await this.setCastingEnabled(
			actor,
			false
		  );

		  if (!castingDisabled) {
			ZFTFA.warn(
			  "⚠️ Gaze of Two Minds | Link cleanup continued after casting-mode cleanup failed",
			  {
				actor: actor.name,
				actorUuid: actor.uuid
			  }
			);
		  }
		}
    try {
      await actor.unsetFlag(
        ZFTFA.MODULE_ID,
        this.linkFlag
      );
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | Failed to remove link state",
        {
          actor: actor.name,
          actorUuid: actor.uuid,
          reason,
          error
        }
      );

      return false;
    }

    ZFTFA.log(
      `✅ Gaze of Two Minds | Link ended for ${actor.name}`,
      {
        reason,
        linkedTokenUuid: existingLink.linkedTokenUuid,
        proxyTokenUuid: existingLink.proxyTokenUuid
      }
    );

    return true;
  },

  /**
   * Resolve and validate all documents referenced by a stored link.
   *
   * @param {Actor} actor
   * @param {object} options
   * @param {boolean} options.requireProxy
   * @returns {Promise<object>}
   */
  async validate(
    actor,
    {
      requireProxy = true
    } = {}
  ) {
    const link = this.getLink(actor);

    if (!link) {
      ZFTFA.log(
        `🔎 Gaze of Two Minds | Validation found no active link for ${actor?.name ?? "unknown actor"}`
      );

      return {
        valid: false,
        reason: "missing-link",
        link: null,
        sourceToken: null,
        linkedToken: null,
        proxyToken: null
      };
    }

    const [
      sourceToken,
      linkedToken,
      proxyToken
    ] = await Promise.all([
      this.resolveUuid(link.sourceTokenUuid),
      this.resolveUuid(link.linkedTokenUuid),
      link.proxyTokenUuid
        ? this.resolveUuid(link.proxyTokenUuid)
        : Promise.resolve(null)
    ]);

    if (!sourceToken) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Validation failed: source token no longer exists",
        {
          sourceTokenUuid: link.sourceTokenUuid
        }
      );

      return {
        valid: false,
        reason: "missing-source-token",
        link,
        sourceToken: null,
        linkedToken,
        proxyToken
      };
    }

    if (!linkedToken) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Validation failed: linked token no longer exists",
        {
          linkedTokenUuid: link.linkedTokenUuid
        }
      );

      return {
        valid: false,
        reason: "missing-linked-token",
        link,
        sourceToken,
        linkedToken: null,
        proxyToken
      };
    }

    if (sourceToken.parent?.uuid !== linkedToken.parent?.uuid) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Validation failed: source and linked tokens are on different scenes",
        {
          sourceSceneUuid: sourceToken.parent?.uuid,
          linkedSceneUuid: linkedToken.parent?.uuid
        }
      );

      return {
        valid: false,
        reason: "different-scenes",
        link,
        sourceToken,
        linkedToken,
        proxyToken
      };
    }

    if (requireProxy && !link.proxyTokenUuid) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Validation failed: link has no proxy UUID"
      );

      return {
        valid: false,
        reason: "missing-proxy-reference",
        link,
        sourceToken,
        linkedToken,
        proxyToken: null
      };
    }

    if (requireProxy && !proxyToken) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Validation failed: proxy token no longer exists",
        {
          proxyTokenUuid: link.proxyTokenUuid
        }
      );

      return {
        valid: false,
        reason: "missing-proxy-token",
        link,
        sourceToken,
        linkedToken,
        proxyToken: null
      };
    }

    if (proxyToken) {
      const proxyMetadata = proxyToken.getFlag(
        ZFTFA.MODULE_ID,
        this.proxyFlag
      );

      if (!proxyMetadata) {
        ZFTFA.warn(
          "⚠️ Gaze of Two Minds | Validation failed: proxy lacks its identifying flag",
          {
            proxyTokenUuid: proxyToken.uuid
          }
        );

        return {
          valid: false,
          reason: "invalid-proxy-flag",
          link,
          sourceToken,
          linkedToken,
          proxyToken
        };
      }

      if (proxyToken.actor?.uuid !== actor.uuid) {
        ZFTFA.warn(
          "⚠️ Gaze of Two Minds | Validation failed: proxy is not linked to the source actor",
          {
            expectedActorUuid: actor.uuid,
            actualActorUuid: proxyToken.actor?.uuid,
            proxyTokenUuid: proxyToken.uuid
          }
        );

        return {
          valid: false,
          reason: "proxy-actor-mismatch",
          link,
          sourceToken,
          linkedToken,
          proxyToken
        };
      }

      if (proxyToken.parent?.uuid !== linkedToken.parent?.uuid) {
        ZFTFA.warn(
          "⚠️ Gaze of Two Minds | Validation failed: proxy and linked token are on different scenes",
          {
            proxySceneUuid: proxyToken.parent?.uuid,
            linkedSceneUuid: linkedToken.parent?.uuid
          }
        );

        return {
          valid: false,
          reason: "proxy-scene-mismatch",
          link,
          sourceToken,
          linkedToken,
          proxyToken
        };
      }
    }

    ZFTFA.log(
      `✅ Gaze of Two Minds | Link validation passed: ${actor.name} → ${linkedToken.name}`,
      {
        sourceTokenUuid: sourceToken.uuid,
        linkedTokenUuid: linkedToken.uuid,
        proxyTokenUuid: proxyToken?.uuid ?? null,
        requireProxy
      }
    );

    return {
      valid: true,
      reason: null,
      link,
      sourceToken,
      linkedToken,
      proxyToken
    };
  },

  /**
   * Establish a link from one controlled token to one targeted token.
   *
   * @returns {Promise<object|null>}
   */
  async establishFromSelection() {
    const controlled = canvas.tokens.controlled;

    if (controlled.length !== 1) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Select exactly one source token before establishing the link",
        {
          controlledCount: controlled.length
        }
      );
      return null;
    }

    const targets = Array.from(game.user.targets);

    if (targets.length !== 1) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Target exactly one willing creature before establishing the link",
        {
          targetCount: targets.length
        }
      );
      return null;
    }

    return this.establish({
      sourceToken: controlled[0],
      linkedToken: targets[0]
    });
  },

  /**
   * End the link belonging to the controlled token's actor.
   *
   * @returns {Promise<boolean>}
   */
  async endFromSelection() {
    const controlled = canvas.tokens.controlled;

    if (controlled.length !== 1) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Select exactly one source token before ending the link",
        {
          controlledCount: controlled.length
        }
      );
      return false;
    }

    const selected = controlled[0];

    if (this.isProxy(selected)) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Select the original Warlock token, not the proxy"
      );
      return false;
    }

    return this.end(
      selected.actor,
      {
        reason: "manual-selection-test"
      }
    );
  },

  /**
   * Validate the link belonging to the controlled token's actor.
   *
   * @returns {Promise<object|null>}
   */
  async validateFromSelection() {
    const controlled = canvas.tokens.controlled;

    if (controlled.length !== 1) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Select exactly one source token before validating the link",
        {
          controlledCount: controlled.length
        }
      );
      return null;
    }

    const selected = controlled[0];

    if (this.isProxy(selected)) {
      ZFTFA.warn(
        "⚠️ Gaze of Two Minds | Select the original Warlock token, not the proxy"
      );
      return null;
    }

    return this.validate(selected.actor);
  },

  /**
   * Resolve a UUID without allowing a failed lookup to escape the service.
   *
   * @param {string|null} uuid
   * @returns {Promise<Document|null>}
   */
  async resolveUuid(uuid) {
    if (!uuid) return null;

    try {
      return await foundry.utils.fromUuid(uuid);
    } catch (error) {
      ZFTFA.error(
        "❌ Gaze of Two Minds | UUID resolution failed",
        {
          uuid,
          error
        }
      );

      return null;
    }
  },

  /**
   * Normalize a Token or TokenDocument into a TokenDocument.
   *
   * @param {Token|TokenDocument|null} token
   * @returns {TokenDocument|null}
   */
  resolveTokenDocument(token) {
    if (!token) return null;

    if (token.documentName === "Token") {
      return token;
    }

    if (token.document?.documentName === "Token") {
      return token.document;
    }

    return null;
  }
};

Hooks.once("ready", async () => {
  try {
    await ZFTFA.GazeOfTwoMinds.register();

    ZFTFA.log(
      "✅ Gaze of Two Minds | Feature automation ready"
    );
  } catch (error) {
    ZFTFA.error(
      "❌ Gaze of Two Minds | Registration failure",
      error
    );
  }
});