
CREATE TABLE `COMIC_SUPERHERO` (
 `comic_id` int(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
 `superhero_id` varchar(20) NOT NULL UNIQUE,
 `comic_name` varchar(15) DEFAULT NULL,
 `summary`text DEFAULT NULL
)


//doga
$x = array(
   "Moto" => "No Mercy , If Found Guilty Death is the Punishment",
   "power" =>" Can communicate with Dogs , Muscular , Intelligent , fearlessness , Martial Art Expert ",
   "weekness" =>"Common Man",
   "alterEgo" =>"Suraj",
   "alterEgoOccuptation" => "Gym Trainer",
   "iconSrc" =>"",
   "bannerSrc" =>"doga_banner.jpg",
   "Detail" => ""
);

{"Moto":"No Mercy , If Found Guilty Death is the Punishment","power":" Can communicate with Dogs , ","weekness":"Muscular , Intelligent , fearlessness , Martial Art Expert ,","alterEgo":"Suraj","alterEgoOccuptation":"Gym Trainer","iconSrc":"","bannerSrc":"doga_banner.jpg","Detail":""}


INSERT INTO  COMIC_SUPERHERO(superhero_id,comic_name,summary) VALUE ('doga','doga','{"Moto":"No Mercy , If Found Guilty Death is the Punishment","power":" Can communicate with Dogs , ","weekness":"Muscular , Intelligent , fearlessness , Martial Art Expert ,","alterEgo":"Suraj","alterEgoOccuptation":"Gym Trainer","iconSrc":"","bannerSrc":"doga_banner.jpg","Detail":""}
');
