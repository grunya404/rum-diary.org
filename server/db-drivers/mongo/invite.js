/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Invitate a user to join the service or view a site. The token is
// sent out in an email verification. When a user verifies, the entry
// is removed from the table.

const Model = require('./model');
const User = require('./user');

const guid = require('../../lib/guid');

const inviteTokenDefinition = {
  token: {
    type: String,
    default: guid
  },
  // TODO - is from_email really needed?
  from_email: String,
  to_email: String,
  // TODO - does hostname and access_level need to be here, or is
  // it enough to add the user to the site when the invite
  // is created?
  hostname: String,
  access_level: Number
};

const InviteTokenModel = Object.create(Model);
InviteTokenModel.init('InviteToken', inviteTokenDefinition);

InviteTokenModel.isTokenValid = function (token) {
  return this.getOne({ token: token })
    .then(function (invitation) {
      return !! invitation;
    });
};

InviteTokenModel.doesInviteeExist = function (token) {
  return this.getOne({ token: token })
    .then(function (invitation) {
      if (! invitation) {
        throw new Error('invalid invitation');
      }

      return User.getOne({ email: invitation.to_email })
        .then(function (user) {
          return !! user;
        });
    });
};

/**
 * Invitatations are only sent if the addressee is not
 * a user at the time of the invitation. The user could
 * have created an account before this invitation is
 * verified. If the user is already created, do nothing
 * besides delete the token. If the user is not created,
 * create them and let the user set the name.
 */

InviteTokenModel.verifyExistingUser = function (token) {
  var user;
  var self = this;
  return this.getOne({ token: token })
    .then(function (invitation) {
      if (! invitation) {
        throw new Error('invalid invitation');
      }

      return User.getOne({ email: invitation.to_email });
    })
    .then(function (_user) {
      if (! _user) {
        throw new Error('invalid user');
      }

      user = _user;

      // delete the token last in case of any failures along the way.
      return self.findOneAndDelete({ token: token })
    })
    .then(function () {
      return user;
    });
};

InviteTokenModel.verifyNewUser = function (token, name) {
  var email;
  var user;

  var self = this;
  return this.getOne({ token: token })
    .then(function (invitation) {
      if (! invitation) {
        throw new Error('invalid invitation');
      }

      email = invitation.to_email;

      return User.getOne({ email: email });
    })
    .then(function (_user) {
      if (_user) {
        throw new Error('user already exists');
      }

      return User.create({
        email: email,
        name: name
      });
    }).then(function (_user) {
      user = _user;

      // delete the token last in case the user creation fails, the user
      // should be able to try again.
      return self.findOneAndDelete({ token: token });
    })
    .then(function () {
      return user;
    });
};

module.exports = InviteTokenModel;
