// Requests list
(function() {

    function setUserpicUrl(role) {
        role.userpicUrl = Userpics.getUrl(role);
    }

    function apply() {
        Room.trigger('requests.updated', Room.requests.items);
    }

    function toggleRequest(role) {
        if (role.come_in) {
            setUserpicUrl(role);
            Room.requests.add(role);
        } else {
            Room.requests.remove(role.role_id);
        }
        apply();
    }

    function updateRequest(data) {
        Room.requests.update(data);
        apply();
    }


    function isEnabled() {
        var level = Room.data.level;
        return Room.moderator && level && level !== 80;
    }

    function enableRequests() {
        var requests = new Rooms.Roles({
            room_id: Room.data.room_id,
            come_in: true
        });
        Room.requests = requests;
        toggleEvents('on');
        return requests.fetch().then(function() {
            requests.items.forEach(setUserpicUrl);
            apply();
        });
    }

    function disableRequests() {
        Room.requests = null;
        Room.trigger('requests.updated', []);
        toggleEvents('off');
    }

    function toggleEvents(toggle) {
        Room[toggle]('role.come_in.updated', toggleRequest);
        //Room[toggle]('role.nickname.updated', updateRequest); когда будет поле для имени
    }

    function toggleRequests() {
        var enabled = isEnabled();
        if (enabled && !Room.requests) {
            enableRequests();
        }
        if (!enabled && Room.requests) {
            disableRequests();
        }
    }

    Rooms.on('selected.level.updated', toggleRequests);

    Rooms.on('my.rank.updated', function() {
        if (isEnabled()) {
            this.promises.push(enableRequests());
        }
    });

    Room.on('leave', function() {
        this.requests = null;
    });

    toggleRequests();

})();

// Update current role
Profile.send = function(data) {
    var role = this.role;
    if (role) {
        return Rest.roles.update(role.role_id, data);
    }
};

// Whip sound
(function() {

    var whippedByMe;

    var whipSound = new Sound({
        mp3: '/script/sound/whip.mp3',
        ogg: '/script/sound/whip.ogg'
    });

    function playWhip(role) {
        if (role.ignored) {
            console.log(whippedByMe);
            if (role.role_id === whippedByMe) {
                whippedByMe = null;
            } else {
                whipSound.play(0.25);
            }
        }
    }

    function toggleEvent(toggle) {
        Socket[toggle ? 'on' : 'off']('role.ignored.updated', playWhip);
    }

    Profile.whip = function() {
        whippedByMe = Profile.role.role_id;
        whipSound.play(0.5);
    };

    Room.on('moderator.changed', function(isModerator) {
        toggleEvent(isModerator);
    });

    toggleEvent(Room.moderator);

})();

// Moderate section
(function() {

    var MODERATOR = 50;

    var $section = $('#profile-moderate');
    var isActive = false;

    function updateRole(data) {
        if (isActive && Profile.role.role_id === data.role_id) {
            var role = $.extend(Profile.role, data);
            Profile.trigger('moderated', getState(role));
            Profile.fit();
        }
    }

    function getState(role) {
        if (role.level >= MODERATOR) {
            return 'rank';
        }
        if (role.level < Rooms.selected.data.level) {
            return role.come_in === 0 ? 'banished' : 'request';
        }
        if (role.ignored) {
            return 'ignored';
        }
        return 'guest';
    }

    function onRoomUpdated() {
        if (isActive) {
            Profile.trigger('moderated', getState(Profile.role));
            Profile.fit();
        }
    }

    Profile.on('show', function(role, isMy) {
        isActive = Boolean(Rooms.selected.myRole.isModerator && !isMy);
        $section.toggle(isActive);
        if (isActive) {
            Profile.trigger('moderated', null);
        }
    });

    Profile.on('ready', function(role) {
        if (isActive) {
            Profile.trigger('moderated', getState(role));
        }
    });

    Socket.on('role.level.updated', updateRole);
    Socket.on('role.ignored.updated', updateRole);
    Socket.on('role.expired.updated', updateRole);
    Socket.on('role.come_in.updated', updateRole);

    Rooms.on('selected.level.updated', function() {
        if (isActive) {
            Profile.trigger('moderated', getState(Profile.role));
            Profile.fit();
        }
    });

    function toggleSection(isModerator) {
        if (!Profile.role) {
            return false;
        }
        var room = Rooms.selected;
        isActive = room.myRole.isModerator && !room.isMy(Profile.role);
        if (isActive) {
            $section.toggle(isActive);
            Profile.trigger('moderated', getState(Profile.role));
        } else {
            $section.hide();
        }
        Profile.fit();
    }

    Rooms.on('my.rank.updated', toggleSection);

    // Wait for sections initialization below
    setTimeout(function() {
        toggleSection(Room.moderator);
    }, 100);

})();

// Profile with request
(function() {

    var $request = $('.moder-request');

    $request.find('.moder-reject').on('click', function() {
        Profile.send({come_in: false});
    });

    $request.find('.moder-invite').on('click', function() {
        Profile.send({level: Room.data.level, come_in: null});
    });

    Profile.on('moderated', function(state) {
        $request.toggle(state === 'request');
    });

})();

// Current rank
(function() {

    var $rank = $('.moder-rank');

    var ranks = {
        50: 'Модератор',
        70: 'Администратор',
        80: 'Создатель комнаты'
    };

    Profile.on('moderated', function(state) {
        if (state === 'rank') {
            $rank.text(ranks[Profile.role.level]);
            $rank.show();
        } else {
            $rank.hide();
        }
    });

})();

// Guest profile
(function() {

    var $guest = $('.moder-guest');

    var $ignore = $guest.find('.moder-ignore');
        $banish = $guest.find('.moder-banish');

    $ignore.on('click', function() {
        Profile.send({ignored: true});
        Profile.whip();
    });

    $banish.on('click', function() {
        Profile.send({
            level: Profile.role.user_id ? 10 : 0,
            come_in: false
        });
    });

    $guest.find('.moder-promote').on('click', function() {
        Profile.trigger('moderated', 'ranks');
        Profile.fit();
    });

    Profile.on('moderated', function(state) {
        if (state === 'guest') {
            var useIgnore = Room.data.level < 20;
            $ignore.toggle(useIgnore);
            $banish.toggle(!useIgnore);
            $guest.show();
        } else {
            $guest.hide();
        }
    });

})();

// Ignored profile
(function() {

    var $ignored = $('.moder-ignored');

    var $sanction = $ignored.find('.moder-sanction'),
        termValue = $sanction.find('.moder-term-value'),
        termOptions = $sanction.find('li');

    var terms = {
        15: 'на 15 минут',
        120: 'на 2 часа',
        720: 'на 12 часов'
    };

    var termsIndex = {
        15: 0,
        120: 1,
        720: 2
    };

    function getMinutes(since, date) {
        return Math.round((date - since) / 60000);
    }

    function canRelease(role) {
        return Boolean(Room.admin || !role.moderator_id || role.moderator_id === Room.myRole.role_id);
    }

    function showIgnored(role) {
        var date = new Date(role.ignored);
        var term = role.expired && getMinutes(date, new Date(role.expired));
        var past = getMinutes(date, Date.now());
        var cr = canRelease(role);
        var tr = past > 720;
        var expired = term ? past >= term : false;
        if (cr && !tr && !expired) {
            termValue.addClass('moder-term-editable');
            toggleTermOption(0, past > 15);
            toggleTermOption(1, past > 120);
            selectTerm(term);
        } else {
            termValue.removeClass('moder-term-editable');
        }
        $sanction.removeClass('moder-term-select');
        termValue.text(term ? terms[term] : (tr ? date.toHumanAgo() : 'пожизненно'));
        termValue.attr('title', String.mix('Начало игнора $1 в $2', date.toSmartDate().toLowerCase(), date.toHumanTime()));
        $ignored.toggleClass('moder-ignored-expired', expired);
        $ignored.find('.moder-release').toggle(cr || tr);
    }

    function toggleTermOption(index, past) {
        termOptions.eq(index).toggleClass('moder-term-past', past);
    }

    function selectTerm(term) {
        termOptions.removeClass('moder-term-selected');
        termOptions.eq(term ? termsIndex[term] : 3).addClass('moder-term-selected');
    }

    $ignored.find('.moder-release').on('click', function() {
        Profile.send({ignored: false});
    });

    $sanction.on('click', 'li:not(.moder-term-past)', function() {
        var term = this.getAttribute('data-term');
        if ($(this).hasClass('moder-term-selected')) {
            $sanction.removeClass('moder-term-select');
        } else {
            selectTerm(term && Number(term));
            Profile.send({expired: term ? Number(term) * 60 : null});
        }
    });

    $sanction.on('click', '.moder-term-editable', function() {
        $sanction.addClass('moder-term-select');
    });

    Profile.on('moderated', function(state, role) {
        if (state === 'ignored') {
            showIgnored(Profile.role)
            $ignored.show();
        } else {
            $ignored.hide();
        }
    });

})();

// Banished profile
(function() {

    var $banished = $('.moder-banished');

    $banished.find('.moder-release').on('click', function() {
        Profile.send({
            level: Room.data.level,
            come_in: null
        });
    });

    Profile.on('moderated', function(state) {
        $banished.toggle(state === 'banished');
    });

})();

// Ignore messages
(function() {

    var $erase = $('.moder-erase');

    var showFor = {
        ignored: true,
        banished: true
    };

    var targetMessage;

    function getMessage(target) {
        var speech = $(target).closest('.speech');
        if (speech.length) {
            return speech.find('.message').first();
        }
    }

    function onErased() {
        targetMessage = null;
        $erase.hide();
    }

    $erase.on('click', function() {
        var message_id = targetMessage.attr('data-id');
        Rest.messages.create(message_id + '/ignore_below').done(onErased);
    });

    Profile.on('show', function(role, isMy) {
        targetMessage = Profile.context.inTalk ? getMessage(Profile.context.target) : null;
    });

    Profile.on('moderated', function(state) {
        if (showFor[state] && targetMessage) {
            var time = targetMessage.find('.msg-time').text();
            $erase.find('.erase-from').text(time);
            $erase.show();
        } else {
            $erase.hide();
        }
    });

})();
