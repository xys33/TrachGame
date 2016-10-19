Router.configure({
	layoutTemplate: 'layout'
});

Router.map(function(){

	this.route('home',{path:'/'});
	this.route('rules');
	this.route('about');
});

