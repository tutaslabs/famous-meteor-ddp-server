Meteor.startup(function () {

    Router.map(function () {
        this.route('/ddp', {
            path: '/ddp',
            where: 'server',
            action: function () {

                var contents = Assets.getText('index.html');
                this.response.end(contents);
            }


        }),
            this.route('/ddp/:etrs', {
                path: '/ddp/:etrs',
                where: 'server',
                action: function () {

                    var x = this.params.etrs;
                    var contents = Assets.getText(x);
                    this.response.end(contents);
                }


            }),
            this.route('/ddp/build/tutaslabs~test/', {
                path: '/ddp/build/tutaslabs~test/',
                where: 'server',
                action: function () {


                    var contents = Assets.getText('build/tutaslabs~test/index.html');
                    this.response.end(contents);
                }


            })


    })
})
