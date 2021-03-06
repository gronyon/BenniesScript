// Deal and give bennies to players
var BenniesScript = (function()
{
	'use strict';

// TODO
// Macro to take away one benny from a player (mass battles token loss)
// Deal token to the GM without using his name (using "GM" as the name/id)
// Move token from player to gm for
// search if possible to fetch "part of" player name instead of equals


	function registerEventHandlers()
	{
		apicmd.on(
			'bennies-deal',
			'Deal bennies to a player',
			'[--quantity QTY --card BENNYNAME] --deck BENNYDECK --player PLAYERNAME',
			[
				['-d', '--deck TEXT', 'Name of the deck where bennies to deal are stored.'],
				['-c', '--card TEXT', 'Name of the card to deal as benny from the deck. If not given, will pick the first card in the deck. Perfect for bennies deck with a single card.'],
				['-p', '--player TEXT', 'Name or Id (use quotes arount id) of the player to deal bennies to. "all" to give same amount of bennies to each online player (excluding GMs).'],
				['-q', '--quantity TEXT', 'Number of bennies to deal to. Must be 1 or higher. Defaults to 1.']
			],
			handleDealBennies
		);

		apicmd.on(
			'bennies-reset',
			'Reset a players bennie back to a given session start stock.',
			'--deck BENNYDECK [--player PLAYERNAME --quantity QTY --card BENNYNAME] [--player2 PLAYERNAME] ',
			[
				['-d', '--deck TEXT', 'Name of the deck where bennies to deal are stored'],
				['-c', '--card TEXT', 'Name of the card to deal as benny from the deck. If not given, will pick the first card in the deck. Perfect for bennies deck with a single card.'],
				['-p', '--player TEXT', 'Name or Id (use quotes around id) of the player to reset bennies of'],
				['-q', '--quantity TEXT', 'Number of bennies to reset to. Must be 0 or higher. 0 will remove all bennies. Defaults to 3.'],
				['-m', '--multi TEXT', 'a list of players with corresponding optional quantities and benny card. Expected format: PLAYER1,PLAYER2|QUANTITY2,PLAYER3|QUANTITY3|BENNY3']
			],
			handleResetBennies
		);

		apicmd.on(
			'bennies-show',
			'Show information about players and their bennies.',
			'--ids ', // ' --deck BENNYDECK',
			[
				// ['-d', '--deck TEXT', 'Name of the deck where bennies to list are stored'],
				['-i', '--ids', 'Show player ids']
			],
			handleShowBennies
		);

		log("-=> Savage Worlds Bennies Script started.");
	}

	function handleShowBennies(argv, msg)
	{
		if (!argv || !argv.opts || !argv.opts.ids) {
			sendChat("api", "/w gm --ids option is mandatory.");
			return;
		}

		var online = _getAllPlayers();
		online.forEach(function(player) {
			var message = "**" + player.get("displayname") + "**";
			if (argv.opts.ids) {
					message += "<br/>" + player.get("id");
			}
			_niceChat(null, message);
		});

	}

	function handleDealBennies(argv, msg)
	{
		if (!argv || !argv.opts || !argv.opts.deck) {
			sendChat("api", "/w gm --deck option is mandatory.");
			return;
		}

		// if player was not provided, present one button per player and let GM pick.
		if (!argv.opts.player) {
			_displayPlayersToDealTo(argv.opts.deck, argv.opts.card, argv.opts.quantity);
			return;
		}

		var benniesDeck = _getDeckByName(argv.opts.deck);
		if (!benniesDeck) {
			sendChat("api", "/w gm Deck not found " + argv.opts.deck);
			return;
		}
		var benniesDeckId = benniesDeck.get("id");

		var bennyCard = null;
		var bennyCardId = null;
		if (argv.opts.card) {
			bennyCard = _getCardInDeck(argv.opts.card, benniesDeck.get('id'));
			if (!bennyCard) {
				sendChat("api", "/w gm Card " + argv.opts.card + " not found in deck " + argv.opts.deck);
				return;
			}
			bennyCardId = bennyCard.get("id");
		}

		var quantity = 1;
		// if quantity not provided or invalid, assume dealing a single benny
		if (argv.opts.quantity) {
			var q = parseInt(argv.opts.quantity);
			if (Number.isNaN(q)) {
				sendChat("api", "/w gm Quantity " + argv.opts.quantity + " is not a valid number.");
				return;
			}
			if (q == 0) {
				sendChat("api", "/w gm You shall deal at least one (instead of " + argv.opts.quantity + ").");
				return;
			}
			quantity = q;
		}

		if ("all" == argv.opts.player) {
			_dealBenniesToAllPlayers(benniesDeckId, bennyCardId, quantity);
			return;
		}

		var player = _getPlayerByNameOrId(argv.opts.player);
		if (!player) {
			sendChat("api", "/w gm Player does not exist " + argv.opts.player + ".");
			return;
		}
		var playerId = player.get("id");

		_dealBenniesToPlayer(player, benniesDeckId, bennyCardId, quantity);
	}

	function _dealBenniesToAllPlayers(benniesDeckId, bennyCardId, quantity)
	{
			var online = _getOnlinePlayers();
			online.forEach(function(p) {
				var i;
				for (i = 0; i < quantity; i++) {
					if (!playerIsGM(p)) {
						_dealBennyToPlayer(p, benniesDeckId, bennyCardId);
					}
				}
			});
	}

	function _dealBenniesToPlayer(player, benniesDeckId, bennyCardId, quantity) {
		var i;
		for (i = 0; i < quantity; i++) {
			_dealBennyToPlayer(player, benniesDeckId, bennyCardId);
		}
	}

	function _dealBennyToPlayer(player, benniesDeckId, bennyCardId)
	{
        var card = null;
        if (bennyCardId) {
            giveCardToPlayer(bennyCardId, player.get("id"));
            card = _getCardById(bennyCardId);
        } else {
            // draw from top, then deal it
            let cardDrawnId = drawCard(benniesDeckId, bennyCardId);
            if (!cardDrawnId) {
                shuffleDeck(benniesDeckId);
                cardDrawnId = drawCard(benniesDeckId, bennyCardId);
            }
            if (!cardDrawnId) {
                sendChat("api", "/w gm The deck seems empty. Recall and shuffle ?");
                return;
            }
            giveCardToPlayer(cardDrawnId, player.get("id"));
            card = _getCardById(cardDrawnId);
        }
        _niceChat(card.get("avatar"), "Dealt a " + card.get("name") + " to **" + player.get("displayname") + "**.");
	}

	function _displayPlayersToDealTo(deckName, cardName, quantity = null)
	{
			var online = _getOnlinePlayers();
			var buttons = "/w gm To whom do you want to deal bennies to ? <br/>";
			online.forEach(function(p) {
				var cardArg = "";
				if (cardName) {
					cardArg = " --card &quot;" + cardName + "&quot;";
				}
				var quantityArg = "";
				if (quantity) {
					quantityArg = " --quantity " + quantity;
				}
				var playername = p.get("displayname");
				var escapedplayername = _macroEscape(p.get("displayname")); // inside the button macro the player name must not contain parenthesis and the likes;
				buttons = buttons + "[" + escapedplayername + "](!bennies-deal --player &quot;" + escapedplayername + "&quot; --deck &quot;" + deckName + "&quot;" + cardArg + quantityArg + ") ";
			});

			sendChat("api", buttons);
	}

	function handleResetBennies(argv, msg)
	{
		if (!argv || !argv.opts || !argv.opts.deck) {
			sendChat("api", "/w gm --deck option is mandatory.");
			return;
		}

		if (!argv.opts.player && !argv.opts.multi) {
			sendChat("api", "/w gm --player or --multi option is missing. --player to reset a single player, --multi to reset multiple players.");
			return;
		}

		var deck = argv.opts.deck;
		var card = argv.opts.card;

		if (argv.opts.player) {
			_resetBenniesForPlayer(argv.opts.player, deck, card, argv.opts.quantity);
			return;
		}

		var players = argv.opts.multi.split(",");
		var data = [];
		players.forEach(function(playerdata) {
			data.push( _parsePlayerQuantity(playerdata) );
		});

		data.forEach(function(playerdata) {
			_resetBenniesForPlayer(playerdata.player, deck, playerdata.card, playerdata.quantity);
		});
	}

	function _resetBenniesForPlayer(argplayer, argdeck, argcard, argquantity) {
		var player = _getPlayerByNameOrId(argplayer);
		if (!player) {
			sendChat("api", "/w gm Player does not exist " + argplayer + ".");
			return;
		}

		var playerHand = _getPlayerHand(player.get("id"));
		if (!playerHand) {
			sendChat("api", "/w gm Player " + argplayer + " seems to be offline.");
			return;
		}

		var benniesDeck = _getDeckByName(argdeck);
		if (!benniesDeck) {
			sendChat("api", "/w gm Deck not found " + argdeck);
			return;
		}

		var bennyCard = null;
		if (argcard) {
			bennyCard = _getCardInDeck(argcard, benniesDeck.get('id'));
			if (!bennyCard) {
				sendChat("api", "/w gm Card " + argcard + " not found in deck " + argdeck);
				return;
			}
		} else {
			bennyCard = _getFirstCardOfDeck(benniesDeck.get('id'));
			if (!bennyCard) {
				sendChat("api", "/w gm No card in deck " + argdeck);
				return;
			}
		}

		var quantity = 3;
		// if quantity not provided, assume reseting back to 3 bennies
		if (argquantity) {
			var q = parseInt(argquantity);
			if (Number.isNaN(q)) {
				sendChat("api", "/w gm Quantity " + argquantity + " is not a valid number.");
				return;
			}
			quantity = q;
		}

		var bennyCardId = bennyCard.get("_id");

		var handAsArray = playerHand.get("currentHand").split(",");

		// First removing all cards (if any) we need to reset
		handAsArray = handAsArray.filter(cardInHand => cardInHand != bennyCardId);

		// Then (re)add cards up to the reset quantity
		if (quantity > 0) {
			var i;
			for (i = 0; i < quantity; i++) {
				handAsArray.push(bennyCardId);
			}
		}

		playerHand.set("currentHand", handAsArray.join(","));
		if (quantity > 0) {
			_niceChat(bennyCard.get("avatar"), "Reset **" + player.get("displayname") + "** " + bennyCard.get("name") + " back to " + quantity + ".");
		} else {
			_niceChat(bennyCard.get("avatar"), "Reset **" + player.get("displayname") + "** " + bennyCard.get("name") + " back to nothing.");
		}
	}

	function _getOnlinePlayers()
	{
		var players = findObjs({
			_type: "player",
			_online: true
		});

		return players;
	}

	function _getAllPlayers()
	{
		var players = findObjs({
			_type: "player"
		});

		return players;
	}

	function _getPlayerByNameOrId(name)
	{
		var players = null;
		if (name.startsWith("-")) {
			players = findObjs({
	 			_type: "player",
	 			_id: name
	 		});
		} else {
			players = findObjs({
	 			_type: "player",
	 			_displayname: name
	 		});
		}

		if (!players) {
			return null;
		}
		return players[0]; // Who would name oneself just like another player hmm ?!
	}

	function _getDeckByName(name)
	{
		var decks = findObjs({
			_type: "deck",
			name: name
		});

		if (!decks) {
			return null;
		}
		return decks[0]; // You shall not name two decks the same. I'll just pick the first found.
	}

	function _getCardInDeck(card, deckId)
	{
		var cards = findObjs({
			_type: "card",
			name: card,
			deckid: deckId
		});

		if (!cards) {
			return null;
		}
		return cards[0]; // let's assume if multiple cards with the same name, they are all the same
	}

	function _getCardById(cardId)
	{
		var cards = findObjs({
			_type: "card",
			id: cardId
		});

		if (!cards) {
			return null;
		}
		return cards[0]; // shall return only one card anyway
	}

	function _getFirstCardOfDeck(deckId)
	{
		var cards = findObjs({
			_type: "card",
			deckid: deckId
		});

		if (!cards) {
			return null;
		}
		return cards[0];
	}

	function _getPlayerHand(playerId)
	{
		var hands = findObjs({
			_type: "hand",
			_parentid: playerId
		});

		if (!hands) {
			return null;
		}
		return hands[0]; // players shall never have more than one hand.
	}

	function _parsePlayerQuantity(playerquantity) {
		var data = {
				player: null,
				quantity: 3,
				card: null
		};
		var fragments = playerquantity.split("|");
		data.player = fragments[0];
		if (fragments.length>=2) {
			data.quantity = fragments[1];
		}
		if (fragments.length>=3) {
			data.card = fragments[2];
		}
		return data;
	}

	function _niceChat(image, message)
	{
		var html = '/desc '
		+ '<div style="display: block; margin-left: -7px; margin-right: 2px; padding: 2px 0px;">'
		+ '  <div style="position: relative; border: 1px solid #000; border-radius: 5px; background-color:ForestGreen; background-image: linear-gradient(rgba(255, 255, 255, .3), rgba(255, 255, 255, 0)); margin-right: -2px; padding: 2px 5px 5px 50px;">'
		+ (image? '    <div style="position: absolute; top: -10px; left: 5px; height: 40px; width: 40px;"><img src="' + image + '" style="height: 40px; width: 40px;" /></div>' : '')
		+ '    <div style="font-family: Candal; font-size: 13px; line-height: 15px; color: #FFF; font-weight: normal; text-align: center;">' + message + '</div>'
		+ '  </div>'
		+ '</div>';

		sendChat("", html);
	}

	function _macroEscape(unsafe)
	{
		var macroEscapes = {
			'|': '&#124;',
			',': '&#44;',
			'}': '&#125;',
			'"': '&quot;',
			"'": '&#x27;',
			'(': '&#40;',
			')': '&#41;',
			'[': '&#91;',
			'\\': '&#92;',
			']': '&#93;'
		};

		// Regex containing the keys listed immediately above.
		var macroEscaper = /[\|,\}"''\(\)\[\\\]]/g;

		if (unsafe) {
			return unsafe.replace(macroEscaper, function (match) {
				 return macroEscapes[match];
			});
		} else {
			return unsafe;
		}
	}

	return {
		registerEventHandlers: registerEventHandlers,
		handleDealBennies: handleDealBennies,
		handleResetBennies: handleResetBennies,
		handleShowBennies: handleShowBennies
	}
}());

on("ready", function()
{
	BenniesScript.registerEventHandlers();
});
