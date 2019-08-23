var express = require('express');
var app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    ent = require('ent'); // Permet de bloquer les caractères HTML (sécurité équivalente à htmlentities en PHP)
app.use(express.static(__dirname+'/public'));

// Chargement de la page index.html
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

var rooms=[];
rooms.push(new Room("room 0"));

var pvMax=100;

var champions=[];
champions.push(new Champion("Anne_Hanas",['main','bras'],['cheveux',]));
champions.push(new Champion("B.R.I.A.N",['tete','oeil','nez','bouche'],[]));
champions.push(new Champion("Le_beauf",['bite','bassin'],['oeil',]));
champions.push(new Champion("Jeannine",['bide',],['tete',]));
champions.push(new Champion("Turpin",['cuisse','mollet','genou'],['epaule',]));

/*
*	L'objet socket représente un joueur
*	Il dispose des attributs:
*		-room: la salle de jeu
*		-pseudo: le nom du mec
*		-champ: le champion du joueur
*		-inGame: booleen qui definit si le joueur est en jeu ou non
*		-game: l'instance de jeu
*		-currentString: la chaine actuellement en memoire de typeing du joueur
*		-pv les points de vie du bonom
*/
io.sockets.on('connection', function (socket, pseudo) {
	
	//Si pas en jeu
	
		//Refresh func (Actualise l'affichage)
		socket.rafraichir=function(){
			socket.emit('getRoomListReturn',getShortRoomList());
			socket.broadcast.emit('getRoomListReturn',getShortRoomList());
			if(socket.room!=null){
				socket.room.sendRoomInfo();
			}
		}
	
	
		// Dès qu'on nous donne un pseudo, on le stocke en variable de session et on informe les autres personnes
		socket.on('nouveau_client', function(pseudo) {
			pseudo = ent.encode(pseudo);
			socket.pseudo = pseudo;
			socket.broadcast.emit('nouveau_client', pseudo);
		});
		//Retourne une liste conscise des rooms
		socket.on('getRoomList',function(){
			socket.emit('getRoomListReturn',getShortRoomList());
		});
		//Quand un gus se connecte a une salle
		socket.on('connectToRoom',function(roomName){
			if(socket.room==null){
				var theRoom=findRoom(roomName);
				socket.room=theRoom;
				theRoom.addJoueur(socket);
				socket.rafraichir();
			}
		});
		// Creer une salle
		socket.on('newRoom',function(roomName){
			rooms.push(new Room(roomName));
			socket.rafraichir();
		});
		//Quand un gus quitte une salle
		socket.on('quitRoom',function(roomName){
			socket.room.playerQuit(socket);
			socket.rafraichir();
			socket.room=null;
		});
		
		//Perso Select
		socket.on('getChampList',function(){
			socket.emit('getChampListReturn',champions);
		});
		// Quand un gus signale qu'il est prêt
		socket.on('player_ready', function(data){
			if(data.ready){
				socket.room.ready++;
				socket.room.otherPlayerReady();
				socket.champ=findChampionByName(data.champ);
			}
			else{
				socket.room.ready--;
			}
			if(socket.room.ready==2){
				socket.room.startGame();
			}
		});

	//Si en jeu

		//Quand un Gus appuie sur une touche
		socket.on('keyPress',function(key){
			//console.log(key);
			if(socket.game!=null){
				socket.game.typedLetter(key,socket);
			}
			//socket.broadcast.emit('message', {pseudo: socket.pseudo, message: "Il a appuyé sur une touche ce con!"});
		});
		
		//Ajoute (ou enleve) des PV au joueur
		socket.addPV=function(nbPV){
			this.pv+=nbPV;
			if(this.pv>pvMax){
				this.pv=pvMax;
			}
			if(this.pv<=0){
				//Perdu!
			}
		}
	
    

    // Dès qu'on reçoit un message, on récupère le pseudo de son auteur et on le transmet aux autres personnes
    socket.on('message', function (message) {
        message = ent.encode(message);
        socket.broadcast.emit('message', {pseudo: socket.pseudo, message: message});
    });
	socket.on('disconnect', function () {
		if(socket.room!=null){
			socket.room.playerQuit(socket);
		}
		socket.broadcast.emit('deco',socket.pseudo);
		socket.emit('getRoomListReturn',getShortRoomList());
		socket.broadcast.emit('getRoomListReturn',getShortRoomList());
	});
	
	
});

server.listen(8080);

//Trouve une salle au nom correspondant
function findRoom(name){
	var found=false;
	var i=0;
	var ret=-42;
	while(!found && i<rooms.length){
		if(rooms[i].nom===name){
			found=true;
			ret=rooms[i];
		}
		i++;
	}
	return ret;
}
//Retourne une version transportable de la liste de rooms
function getShortRoomList(){
	var ret=[];
	for(var i=0; i<rooms.length;i++){
		ret.push({nom: rooms[i].nom , nbJoueurs: rooms[i].joueurs.length});
	}
	return ret;
}

//L'objet Room
function Room(nom){
	this.nom=nom;
	this.joueurs=[];
	this.full=false;
	this.ready=0;	//Ready=2
	this.addJoueur=function(joueur){
		if(!this.full){
			this.joueurs.push(joueur);
			if(this.joueurs.length==2){
				if(this.ready==2){
					this.full=true;
					this.startGame();
				}
			}
		}
	};
	// Lorsqu'un Gus quitte
	this.playerQuit=function(joueur){
		this.full=false;
		var i=0;
		var done=false;
		while(!done && i<this.joueurs.length){
			if(this.joueurs[i]===joueur){
				this.joueurs.splice(i,1);
			}
			i++;
		}
	};
	// Retourne les infos de base de la salle
	this.sendRoomInfo=function(){
		for(var i=0;i<this.joueurs.length;i++){
			this.joueurs[i].emit('connectToRoomReturn',{name:this.nom,full:this.full});
		};
	};
	// Signale aux joueurs qui est prêt
	this.otherPlayerReady=function(){
		for(var i=0;i<this.joueurs.length;i++){
			this.joueurs[i].emit('otherPlayerReady',true);
		};
	};
	// Passe en mode jeu
	this.startGame=function(){
		var leJeu=new Game();
		for(var i=0; i<this.joueurs.length;i++){
			var enemyChamp=this.joueurs[Math.abs(i-1)].champ;
			this.joueurs[i].emit('startGame',enemyChamp.nom);
			this.joueurs[i].inGame=true;
			this.joueurs[i].game=leJeu;
			this.joueurs[i].currentString="";
			this.joueurs[i].pv=pvMax;
		}
		this.timer();
	};
	// Renvoie les degats et soins
	this.applyHits=function(info,player){
		var indexPlayer=this.joueurs.indexOf(player);
		if(info<0){
			this.joueurs[Math.abs(indexPlayer-1)].addPV(info);
			this.joueurs[indexPlayer].emit('hit',info);
			this.joueurs[Math.abs(indexPlayer-1)].emit('hited',info);
		}
		else{
			this.joueurs[indexPlayer].addPV(info);
			this.joueurs[indexPlayer].emit('hited',info);
			this.joueurs[Math.abs(indexPlayer-1)].emit('hit',info);
		}
		player.currentString="";
		player.emit('keyPressReturn',{currentString: player.currentString,goodInput: info});
		this.sendFightInfo();
	}
	// IN  GAME
	//Renvoie les infos de base du jeu
	this.sendFightInfo=function(){
		this.joueurs.forEach(function(j){
			if(j.inGame){
				j.emit('fightInfo',{comboLetters: j.game.lettres, });
			}
		});
	}
	//Timer qui notifie les bonoms et ajoute une letre das la liste des lettres a combo
	this.timer=function(){
		var ceci=this;
		setInterval(function() {
			if(ceci.joueurs[0].game!=null){
				ceci.joueurs[0].game.pickLetters(1);
			}
			ceci.sendFightInfo();
		}, 5000);
	}
}

//Objet Game
function Game(){
	this.lettres=[];
	this.randomLetter=function(){
		var rand=Math.random()*(122-97)+97;
		return String.fromCharCode(rand);
	}
	//Ajoute une lettre a la lsite des combos
	this.pickLetters=function(nbLetters){
		var it=1;
		if(nbLetters!=null){
			it=nbLetters;
		}
		for(var i=0;i<it;i++){
			this.lettres.push(this.randomLetter());
		}
	}
	//Lorsque une letttre est tapee par l'utilisateur
	this.typedLetter=function(letter,player){
		var champion=player.champ;
		var currentString=player.currentString;
		
		currentString+=letter;
		var niceTyping=champion.doesItMatchAnything(currentString);
		if(niceTyping===false){
			player.currentString="";
			player.emit('keyPressReturn',{currentString: player.currentString,goodInput: niceTyping});
		}
		else if(niceTyping===true){
			player.currentString+=letter;
			player.emit('keyPressReturn',{currentString: player.currentString,goodInput: niceTyping});
		}
		else{
			var combo=this.countComboWord(currentString);
			if(combo>0){
				player.room.applyHits(niceTyping, player);
			}
			else{
				// Pas de lettres de la liste. Mot invalide
				player.currentString="";
				niceTyping=false;
				player.emit('keyPressReturn',{currentString: player.currentString,goodInput: niceTyping});
			}
			//player.emit('keyPressReturn',{currentString: player.currentString,goodInput: niceTyping});
		}
	}
	//Verifie que le mot saisi contient une ou plusieurs lettres de combo
	// Renvoie le nombre de lettres à combo il y a dans le mot
	this.countComboWord=function(word){
		var ret=0;
		var lettersUsed=[];
		for( var i=0; i< this.lettres.length;i++){
			if(word.includes(this.lettres[i])){
				lettersUsed.push(this.lettres[i]);
				ret++;
			}
		}
		//On vire les lettres utilisees
		for(var i=0;i<lettersUsed.length;i++){
			var index=this.lettres.indexOf(lettersUsed[i]);
			this.lettres.replace(index,1);
		}
		return ret;
	}
}
/**
*	Trouve le champion correspondant au nom
**/
function findChampionByName(name){
	var found=false;
	var i=0;
	var ret=null;
	while(!found && i< champions.length){
		if(champions[i].nom===name){
			ret=champions[i];
			found=true;
		}
		i++;
	}
	return ret;
}

//L'objet perso
function Champion(nom,partiesOffensives,partiesDefensives){
	this.nom=nom;
	this.po=getAnatomie(partiesOffensives);
	this.pd=getAnatomie(partiesDefensives);
	//Renvoie TRUE si l'entree correspond au début d'un mot valable
	//Renvoie FALSE si le mot est faux
	//Renvoie un chiffre positif si le mot est complet et soigne
	//Renvoie un chiffre negatif si le mot est complet et fait bobo
	this.doesItMatchAnything=function(saisie){
		var ret=false;
		var i=0;
		while(ret===false && i<this.po.length){
			if(this.po[i].substring(0,saisie.length)==saisie){
				if(saisie.length==this.po[i].length){
					ret=this.getWordDamage(this.po[i])*(-1);
				}
				else{
					ret=true;
				}
			}
			i++;
		}
		i=0;
		while(ret===false && i<this.pd.length){
			if(this.pd[i].substring(0,saisie.length)==saisie){
				if(saisie.length==this.pd[i].length){
					ret=this.getWordDamage(this.pd[i]);
				}
				else{
					ret=true;
				}
			}
			i++;
		}
		return ret;
	}
	//Calcule le nombre de points que vaut un mot
	// TODO
	this.getWordDamage=function(word){
		return word.length;
	}
}


/*
*	Renvoie la liste des mots d'un champion
*/
function getAnatomie(names){
	
	var partiesDuCorps=[
		['cheveux','tignasse'],
		['tete','crane','visage','tronche'],
		['oeil','iris'],
		['nez','peninsule'],
		['bouche','sourire'],
		['cou','gorge'],
		['epaule','omoplate'],
		['bras','cubitus'],
		['coude','coude'],
		['main','mimine'],
		['bide','ventre'],
		['bassin','fesse'],
		['bite','queue'],
		['cuisse','femur'],
		['genou','rotule'],
		['mollet','tibia'],
		['pied','metatarse']
	];
	
	var ret=[];
	for(var j=0; j<names.length;j++){
		var ok=false;
		var i=0;
		while(!ok && i< partiesDuCorps.length){
			if(partiesDuCorps[i][0]==names[j]){
				if(ret.length==0){
					ret=partiesDuCorps[i];
				}
				else{
					ret=ret.concat(partiesDuCorps[i]);
				}
				ok=true;
			}
			i++;
		}
	}
	return ret;
}